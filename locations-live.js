/*
 * locations-live.js  --  puts the live Firebase town data on the Locations page.
 *
 * This uses the same information the /billboard/v1/towns tree holds in the Realtime Database:
 * every town, its county, each board (ID, side, size, pixel pitch, creative matrix, ad length,
 * street address, coordinates) and the ads currently in that town's rotation.
 *
 * The page already looks for a Google Sheet inventory feed that no longer exists, so until this
 * script runs it shows "Live Locations Are Being Updated". This fills the same #grid-root with the
 * Firebase data instead, using the page's own card styles so nothing looks out of place.
 *
 * Nothing else on the page is touched: the fallback stays as the backup if the fetch fails.
 */
(function () {
  var RTDB = "https://skventuresigns-c35d5-default-rtdb.firebaseio.com/billboard/v1/towns.json";
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

  function activeAds(ads) {
    return (ads || []).filter(function (a) {
      return String(a.status || "").toLowerCase() !== "inactive" &&
             String(a.status || "").toLowerCase() !== "retired";
    });
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

  function card(key, town) {
    var screens = town.screens || [];
    var ads = activeAds(town.ads);
    var first = screens[0] || {};
    var pos = coords(screens);
    var address = uniq(screens.map(function (s) { return s.address; }))[0] || "";
    var townName = town.name || key.replace(/\b\w/g, function (c) { return c.toUpperCase(); });

    var mapQuery = pos
      ? pos.lat + "," + pos.lng
      : encodeURIComponent(address + " " + townName + " IL");
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
          var live = String(a.status || "").toLowerCase() === "active" ? "running" : esc(a.status || "");
          return "<li><strong>" + esc(a.advertiser || "Ad") + "</strong> &middot; " + esc(live) + (when ? " &middot; " + esc(when) : "") + "</li>";
        }).join("")
      : '<li class="skvl-empty">No ad booked in this town right now &mdash; the spot is open.</li>';

    return '\n<div class="advertising-card-box" data-skvl-card="' + esc(key) + '">\n' +
      '  <div class="card-top-row">\n' +
      '    <div class="flex flex-col items-center">\n' +
      '      <div class="horizontal-map-container">\n' +
      '        <iframe class="w-full h-full opacity-100" src="' + mapEmbed + '" loading="lazy" title="Map of ' + esc(townName) + '"></iframe>\n' +
      '        <a href="' + mapLink + '" target="_blank" rel="noopener" class="absolute bottom-4 right-4 bg-white text-black p-3 rounded-full shadow-2xl hover:scale-110 transition-transform"><i data-lucide="navigation" class="w-6 h-6"></i></a>\n' +
      '      </div>\n' +
      (pos ? '<div class="coord-display">Lat: ' + pos.lat.toFixed(5) + " | Long: " + pos.lng.toFixed(5) + "</div>" : "") +
      '    </div>\n' +
      '    <div class="card-primary-info">\n' +
      '      <h2 class="town-title">' + esc(townName) + "</h2>\n" +
      (town.county ? '      <span class="county-tag">' + esc(town.county) + " County, IL</span>\n" : "") +
      (address ? '      <span class="address-tag">' + esc(address) + "</span>\n" : "") +
      (stats.length ? '      <div class="stats-tag">' + stats.join("") + "</div>\n" : "") +
      (specs.length ? '      <p class="description-tag">' + specs.join(" &middot; ") + "</p>\n" : "") +
      '    </div>\n' +
      '    <div class="card-right-sidebar">\n' +
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

  function render(towns) {
    var grid = document.getElementById("grid-root");
    if (!grid) return;
    var keys = Object.keys(towns).sort(function (a, b) {
      var an = (towns[a].name || a), bn = (towns[b].name || b);
      return an.localeCompare(bn);
    });
    grid.innerHTML = keys.filter(function (k) { return towns[k] && typeof towns[k] === "object"; })
                        .map(function (k) { return card(k, towns[k]); }).join("");
    grid.classList.remove("hidden");
    grid.dataset.skvl = "1";
    grid.dataset.fallback = "1";          // stops the "being updated" card from replacing this
    var spinner = document.getElementById("loading-spinner");
    if (spinner) spinner.classList.add("hidden");
    if (typeof lucide !== "undefined") lucide.createIcons();
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
      ".skvl-empty{opacity:.6;font-style:italic}";
    document.head.appendChild(s);
  }

  function start() {
    style();
    var grid = document.getElementById("grid-root");
    if (grid) grid.dataset.fallback = "1";       // never draw the "updating" card while we load
    var towns = null;

    function paint() { if (towns) render(towns); }

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

    fetch(RTDB, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("rtdb " + r.status); return r.json(); })
      .then(function (data) {
        if (!data || !Object.keys(data).length) throw new Error("no towns in the database");
        towns = data;
        paint();
      })
      .catch(function (e) {
        // leave the page's own "being updated" message in place
        var g = document.getElementById("grid-root");
        if (g) g.dataset.fallback = "0";
        var sp = document.getElementById("loading-spinner");
        if (sp) sp.classList.add("hidden");
        console.warn("Live town list unavailable:", e.message);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
