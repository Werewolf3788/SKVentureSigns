/*
 * locations-live.js  --  puts the live Firebase town data on the Locations page.
 *
 * Two Firebase sources are read together:
 *
 *  Realtime Database  /billboard/v1/towns
 *      the structure of the world: every town, its county, and each board there
 *      (ID, side, size, pixel pitch, creative matrix, ad length, street address,
 *      latitude and longitude).
 *
 *  Firestore  skventure_ads
 *      the advertising side: every ad record with its advertiser, creative URL,
 *      status and expiration date.
 *
 * The town and board list comes from the Realtime Database. Ads running in each
 * town are the union of that town's Realtime Database rotation and its active
 * Firestore records, so a town looks complete whether it was last updated by the
 * spreadsheet pusher or the sign player. If the Realtime Database cannot be
 * reached at all, the page still builds itself from the Firestore ads so the
 * location list is never blank.
 *
 * The page already looks for a Google Sheet inventory feed that no longer exists,
 * so until this script runs it shows "Live Locations Are Being Updated". This
 * fills the same #grid-root with Firebase data, using the page's own card styles.
 */

(function () {
  var RTDB = "https://skventuresigns-c35d5-default-rtdb.firebaseio.com/billboard/v1/towns.json";
  var FS = "https://firestore.googleapis.com/v1/projects/skventuresigns-c35d5/databases/(default)" +
           "/documents/skventure_ads?pageSize=300" +
           "&key=AIzaSyCVff98TiQjhjSFrLm_0kMGZ5NlrVTPM7g";
  var PLAYER = "./Claude-Test/billboard-firestore.html";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }

  function slug(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function titleCase(key) {
    return String(key || "").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function isLive(status) {
    var s = String(status || "").toLowerCase();
    return s !== "inactive" && s !== "retired" && s !== "paused" && s !== "expired";
  }

  function activeAds(ads) {
    return (ads || []).filter(function (a) { return a && isLive(a.status); });
  }

  function coords(screens) {
    for (var i = 0; i < screens.length; i++) {
      var lat = parseFloat(screens[i].lat), lng = parseFloat(screens[i].lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        if (Math.abs(lat) > 50 && Math.abs(lng) < 50) { var t = lat; lat = lng; lng = t; }  // swapped columns
        return { lat: lat, lng: lng };
      }
    }
    return null;
  }

  /* ---------- Firestore ---------- */

  function fsText(fields, name) {
    var f = fields && fields[name];
    if (!f) return "";
    if (f.stringValue != null) return f.stringValue;
    if (f.integerValue != null) return String(f.integerValue);
    if (f.booleanValue != null) return String(f.booleanValue);
    return "";
  }

  function expired(dateText) {
    if (!dateText) return false;
    var t = Date.parse(dateText);
    return !isNaN(t) && t < Date.now();
  }

  // Firestore records grouped by town key: { xenia: [ {advertiser, url, status} ] }
  function groupFirestore(docs) {
    var byTown = {};
    (docs || []).forEach(function (doc) {
      var f = doc.fields || {};
      var town = slug(fsText(f, "location") || fsText(f, "sheetName") || fsText(f, "town"));
      if (!town) return;
      if (!isLive(fsText(f, "status"))) return;
      if (f.removedFromSheet && f.removedFromSheet.booleanValue === true) return;  // taken off the sheet, not running
      if (expired(fsText(f, "expirationDate"))) return;
      var advertiser = fsText(f, "advertiser") || "Ad";
      var url = fsText(f, "imageSrc") || fsText(f, "imageUrl") || fsText(f, "url");
      var key = slug(advertiser) + "|" + slug(url);
      byTown[town] = byTown[town] || [];
      var dup = byTown[town].some(function (a) { return slug(a.advertiser) + "|" + slug(a.url) === key; });
      if (!dup) byTown[town].push({ advertiser: advertiser, url: url, status: fsText(f, "status") || "active", source: "firestore" });
    });
    return byTown;
  }

  function mergeAds(rtdbAds, fsAds) {
    var out = activeAds(rtdbAds).map(function (a) {
      return { advertiser: a.advertiser, url: a.url, status: a.status, startDate: a.startDate, endDate: a.endDate };
    });
    (fsAds || []).forEach(function (a) {
      var key = slug(a.advertiser) + "|" + slug(a.url);
      var dup = out.some(function (b) { return slug(b.advertiser) + "|" + slug(b.url) === key; }) ||
                out.some(function (b) { return a.advertiser && slug(b.advertiser) === slug(a.advertiser); });
      if (!dup) out.push(a);
    });
    return out;
  }

  /* ---------- Card ---------- */

  // Every town that is on screen, so the descriptions lightbox can fill itself from live data.
  var CARDS = {};

  function card(key, town, fsAds) {
    var screens = town.screens || [];
    var ads = mergeAds(town.ads, fsAds);
    var first = screens[0] || {};
    var pos = coords(screens);
    var address = uniq(screens.map(function (s) { return s.address; }))[0] || "";
    var townName = town.name || titleCase(key);

    var mapQuery = pos
      ? pos.lat + "," + pos.lng
      : encodeURIComponent((address || townName + ", IL"));
    var mapEmbed = "https://maps.google.com/maps?q=" + mapQuery + "&t=k&z=16&output=embed";
    var mapLink = "https://www.google.com/maps/search/?api=1&query=" + mapQuery;

    var sizes = uniq(screens.map(function (s) { return s.size; }));
    var boards = screens.length;
    var seconds = uniq(screens.map(function (s) { return s.adSeconds; })).filter(Boolean);

    var stats = [];
    if (sizes.length) stats.push('<span><strong class="opacity-50 uppercase text-[10px] tracking-widest">Size:</strong> ' + esc(sizes.join(" / ")) + "</span>");
    if (boards) stats.push('<span><strong class="opacity-50 uppercase text-[10px] tracking-widest">Boards:</strong> ' + boards + "</span>");
    if (seconds.length) stats.push('<span><strong class="opacity-50 uppercase text-[10px] tracking-widest">Ad Length:</strong> ' + esc(seconds.join(" / ")) + " sec</span>");

    var specs = [];
    if (first.pitch) specs.push(esc(first.pitch));
    if (first.matrix) specs.push(esc(first.matrix) + " px creative");
    if (ads.length) specs.push(ads.length + (ads.length === 1 ? " ad in rotation" : " ads in rotation"));

    var boardRows = screens.map(function (s) {
      var bits = [
        s.side ? esc(s.side) + " side" : "",
        s.size ? esc(s.size) : "",
        s.matrix ? esc(s.matrix) : "",
        s.adSeconds ? s.adSeconds + " sec" : ""
      ].filter(Boolean);
      return "<li><strong>" + esc(s.id || "—") + "</strong> &middot; " + bits.join(" &middot; ") + "</li>";
    }).join("");

    var adRows = ads.length
      ? ads.map(function (a) {
          var when = [a.startDate, a.endDate].filter(Boolean).join(" → ");
          var live = "running";
          return "<li><strong>" + esc(a.advertiser || "Ad") + "</strong> &middot; " + esc(live) + (when ? " &middot; " + esc(when) : "") + "</li>";
        }).join("")
      : '<li class="skvl-empty">No ad booked in this town right now &mdash; the spot is open.</li>';

    // Latitude and longitude stay pinned on the map image itself, not just under it.
    var coordLine = pos
      ? '<div class="coord-display">Lat: ' + pos.lat.toFixed(5) + " | Long: " + pos.lng.toFixed(5) + "</div>"
      : "";

    CARDS[key] = {
      name: townName, town: town, screens: screens, ads: ads, pos: pos,
      address: address, county: town.county || "", mapEmbed: mapEmbed, mapLink: mapLink
    };

    return '\n<div class="advertising-card-box" data-skvl-card="' + esc(key) + '">\n' +
      '  <div class="card-top-row">\n' +
      '    <div class="flex flex-col items-center">\n' +
      '      <div class="horizontal-map-container">\n' +
      '        <iframe class="w-full h-full opacity-100" src="' + mapEmbed + '" loading="lazy" title="Map of ' + esc(townName) + '"></iframe>\n' +
      '        <a href="' + mapLink + '" target="_blank" rel="noopener" class="absolute bottom-4 right-4 bg-white text-black p-3 rounded-full shadow-2xl hover:scale-110 transition-transform"><i data-lucide="navigation" class="w-6 h-6"></i></a>\n' +
      (pos ? '        <span class="skvl-coord" title="Latitude and longitude of this board">' + pos.lat.toFixed(5) + ", " + pos.lng.toFixed(5) + "</span>\n" : "") +
      '      </div>\n' +
      coordLine +
      '    </div>\n' +
      '    <div class="card-primary-info">\n' +
      '      <h2 class="town-title">' + esc(townName) + "</h2>\n" +
      (town.county ? '      <span class="county-tag">' + esc(town.county) + " County, IL</span>\n" : "") +
      (address ? '      <span class="address-tag">' + esc(address) + "</span>\n" : "") +
      (stats.length ? '      <div class="stats-tag">' + stats.join("") + "</div>\n" : "") +
      (specs.length ? '      <p class="description-tag">' + specs.join(" &middot; ") + "</p>\n" : "") +
      '    </div>\n' +
      '    <div class="card-right-sidebar">\n' +
      '      <button type="button" class="view-specs-btn" onclick="skvlShowSpecs(\'' + esc(key) + '\')"><i data-lucide="layout-list" class="w-4 h-4"></i> View descriptions</button>\n' +
      '      <a class="view-specs-btn" href="' + PLAYER + "?town=" + encodeURIComponent(key) + '&fs=1" target="_blank" rel="noopener"><i data-lucide="play" class="w-4 h-4"></i> Watch This Board</a>\n' +
      '      <span class="view-specs-btn" style="cursor:pointer" onclick="openEmailSmartActions(\'Scott.Robinson@skventuresigns.com\', \'Location Availability - ' + esc(townName) + '\')"><i data-lucide="mail" class="w-4 h-4"></i> Email for Availability</span>\n' +
      '    </div>\n' +
      '  </div>\n' +
      '  <div class="skvl-details">\n' +
      '    <div class="skvl-col"><h3 class="skvl-h">Boards at this location</h3><ul>' + (boardRows || '<li class="skvl-empty">Board details are being added.</li>') + "</ul></div>\n" +
      '    <div class="skvl-col"><h3 class="skvl-h">Ads running now</h3><ul>' + adRows + "</ul></div>\n" +
      '  </div>\n' +
      "</div>\n";
  }

  /* ---------- Descriptions lightbox (the popup the page was built with) ---------- */

  function specItem(label, value) {
    if (!value) return "";
    return '<div class="modal-spec-item"><span class="modal-spec-label">' + esc(label) +
           '</span><span class="modal-spec-value">' + value + "</span></div>";
  }

  window.skvlShowSpecs = function (key) {
    var entry = CARDS[key];
    if (!entry) return;

    var overlay = document.getElementById("lightbox-overlay");
    var img = document.getElementById("lightbox-image");
    var modal = document.getElementById("specs-modal");
    var root = document.getElementById("specs-content-root");
    if (!overlay || !modal || !root) return;  // page markup changed, do nothing quietly

    var screens = entry.screens || [];
    var first = screens[0] || {};
    var pos = entry.pos;
    var sizes = uniq(screens.map(function (s) { return s.size; }));
    var seconds = uniq(screens.map(function (s) { return s.adSeconds; })).filter(Boolean);

    var html = "";

    // The location's map, enlarged, with the latitude and longitude still pinned on it.
    html += '<div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:16px;overflow:hidden;margin-bottom:14px">' +
            '<iframe src="' + entry.mapEmbed + '" style="width:100%;height:100%;border:0" loading="lazy" title="Map of ' + esc(entry.name) + '"></iframe>' +
            (pos ? '<span class="skvl-coord">' + pos.lat.toFixed(5) + ", " + pos.lng.toFixed(5) + "</span>" : "") +
            "</div>";

    if (pos) {
      html += '<div class="coord-display" style="margin:0 0 16px">Lat: ' + pos.lat.toFixed(5) + " | Long: " + pos.lng.toFixed(5) + "</div>";
    }

    var props = [];
    if (entry.address) props.push(['Address', esc(entry.address)]);
    if (entry.county) props.push(['County', esc(entry.county) + " County, IL"]);
    if (screens.length) props.push(['Boards here', String(screens.length)]);
    if (sizes.length) props.push(['Size', esc(sizes.join(" / "))]);
    if (seconds.length) props.push(['Ad Length', esc(seconds.join(" / ")) + " sec"]);
    if (first.pitch) props.push(['Pixel Pitch', esc(first.pitch)]);
    if (first.matrix) props.push(['Creative Matrix', esc(first.matrix) + " px"]);

    if (props.length) {
      html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-10 mb-6 w-full">' +
              props.map(function (p) { return specItem(p[0], p[1]); }).join("") +
              "</div>";
    }

    if (screens.length) {
      var rows = screens.map(function (s) {
        return "<div>" + esc(s.id || "—") + (s.side ? " &middot; " + esc(s.side) + " side" : "") +
               (s.size ? " &middot; " + esc(s.size) : "") + (s.matrix ? " &middot; " + esc(s.matrix) : "") +
               (s.adSeconds ? " &middot; " + s.adSeconds + " sec" : "") + "</div>";
      }).join("");
      html += '<div class="modal-row-bottom" style="grid-template-columns:1fr;margin-top:0">' +
              '<div class="modal-spec-item"><span class="modal-spec-label">Boards at this location</span>' +
              '<span class="modal-spec-value" style="font-weight:500;line-height:1.8">' + rows + "</span></div></div>";
    }

    // The billboards themselves: every ad in rotation. Click one to open it full size.
    if (entry.ads.length) {
      var ads = entry.ads.map(function (a) {
        var url = a.url || "";
        return '<div class="modal-spec-item">' +
               '<span class="modal-spec-label">' + esc(a.advertiser || "Ad") + "</span>" +
               (url
                 ? '<img src="' + esc(url) + '" alt="' + esc(a.advertiser || "Billboard ad") + '" class="modal-thumb" style="object-fit:contain;background:#000" onclick="openLightbox(\'' + esc(url) + '\')">'
                 : '<span class="modal-spec-value" style="font-weight:500">Creative coming soon</span>') +
               "</div>";
      }).join("");
      html += '<div class="modal-row" style="grid-template-columns:1fr 1fr;margin-top:6px">' + ads + "</div>";
    } else {
      html += '<p style="opacity:.6;font-style:italic">No ad is booked in this town right now &mdash; the spot is open.</p>';
    }

    root.innerHTML = html;

    var heading = modal.querySelector("h3");
    if (heading) heading.textContent = entry.name + " — technical descriptions";

    if (img) img.style.display = "none";
    modal.style.display = "block";
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    if (typeof lucide !== "undefined") lucide.createIcons();
  };

  function render(towns, fsByTown) {
    var grid = document.getElementById("grid-root");
    if (!grid) return;
    var keys = Object.keys(towns).sort(function (a, b) {
      var an = (towns[a].name || a), bn = (towns[b].name || b);
      return an.localeCompare(bn);
    });
    grid.innerHTML = keys.filter(function (k) { return towns[k] && typeof towns[k] === "object"; })
                        .map(function (k) { return card(k, towns[k], fsByTown[slug(k)] || fsByTown[k]); }).join("");
    grid.classList.remove("hidden");
    grid.dataset.skvl = "1";
    grid.dataset.fallback = "1";          // stops the "being updated" card from replacing this
    var spinner = document.getElementById("loading-spinner");
    if (spinner) spinner.classList.add("hidden");
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  // Rebuild a town list from Firestore alone, used only when the Realtime Database is unreachable.
  function townsFromFirestore(fsByTown) {
    var towns = {};
    Object.keys(fsByTown).forEach(function (key) {
      if (!fsByTown[key].length) return;
      towns[key] = { name: titleCase(key), ads: fsByTown[key], screens: [] };
    });
    return towns;
  }

  function style() {
    if (document.getElementById("skvl-style")) return;
    var s = document.createElement("style");
    s.id = "skvl-style";
    s.textContent =
      ".skvl-details{display:flex;flex-wrap:wrap;gap:28px;margin-top:22px;padding-top:18px;" +
      "border-top:1px solid rgba(255,255,255,.15);color:#fff;font-family:Georgia,serif;font-size:14px}" +
      ".skvl-col{flex:1 1 300px;min-width:240px}" +
      ".skvl-h{margin:0 0 8px;font-family:'Poppins',sans-serif;font-size:11px;font-weight:800;" +
      "letter-spacing:1.2px;text-transform:uppercase;color:var(--sk-gold,#ffc000)}" +
      ".skvl-col ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}" +
      ".skvl-col li{opacity:.92;line-height:1.45}" +
      ".skvl-col li strong{opacity:1}" +
      ".skvl-empty{opacity:.6;font-style:italic}" +
      ".skvl-coord{position:absolute;left:10px;bottom:10px;z-index:2;pointer-events:none;" +
      "background:rgba(0,0,0,.66);color:#fff;font-family:Georgia,serif;font-size:11px;font-weight:600;" +
      "letter-spacing:.3px;padding:4px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.3);" +
      "text-shadow:0 1px 2px rgba(0,0,0,.8)}";
    document.head.appendChild(s);
  }

  function start() {
    style();
    var grid = document.getElementById("grid-root");
    if (grid) grid.dataset.fallback = "1";       // never draw the "updating" card while we load
    var towns = null, fsByTown = {};

    function paint() { if (towns) render(towns, fsByTown); }

    // If anything else (the old feed code, an auto-refresh) rewrites the grid, put ours back.
    var gridEl = document.getElementById("grid-root");
    if (gridEl && window.MutationObserver) {
      var busy = false;
      new MutationObserver(function () {
        if (busy || !towns) return;
        if (gridEl.dataset.skvl === "1") return;
        busy = true;
        paint();
        setTimeout(function () { busy = false; }, 0);
      }).observe(gridEl, { childList: true });
    }

    // Firestore first: it loads fast and holds the ad list.
    var fsReady = fetch(FS, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("firestore " + r.status); return r.json(); })
      .then(function (data) { fsByTown = groupFirestore(data && data.documents); })
      .catch(function (e) { console.warn("Firestore ads unavailable:", e.message); });

    fsReady.then(function () {
      fetch(RTDB, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("rtdb " + r.status); return r.json(); })
        .then(function (data) {
          if (!data || !Object.keys(data).length) throw new Error("no towns in the database");
          towns = data;
          paint();
        })
        .catch(function (e) {
          // Realtime Database is down: keep the page useful with the Firestore towns we know about.
          console.warn("Live town list unavailable:", e.message);
          var fromFs = townsFromFirestore(fsByTown);
          if (Object.keys(fromFs).length) { towns = fromFs; paint(); return; }
          var g = document.getElementById("grid-root");
          if (g) g.dataset.fallback = "0";
          var sp = document.getElementById("loading-spinner");
          if (sp) sp.classList.add("hidden");
        });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
