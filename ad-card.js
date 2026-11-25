/*
 * ad-card.js  --  the "Advertising" card, but it shows a real ad from the board nearest the visitor.
 *
 * HOW TO USE IT ON ANY PAGE (two lines, nothing else to change):
 *
 *     <div id="skv-ad-card"></div>
 *     <script src="/ad-card.js" defer></script>
 *
 * The card draws itself inside #skv-ad-card (or every element with data-skv-ad-card).
 *
 * WHAT IT DOES
 *   1. Shows the normal card with the grey "S&K Venture Signs" placeholder.
 *   2. If the visitor lets the browser share their location (a small "Use my location" link, so
 *      nobody is asked without choosing), it finds the closest S&K board from the
 *      skventure_locations documents (lat/lng we already store per town).
 *   3. It then asks Firestore for that town's ads and shows the first one that is really running
 *      today: status active, not retired, not past its end date.
 *   4. If the visitor says no, or nothing is running for that town, the placeholder stays. The
 *      "AVAILABLE LOCATIONS" button always works.
 *
 * Only public data is read: the same Firestore reads the player does. Nothing about the visitor is
 * stored or sent anywhere; the coordinates are used once, in the browser, to pick a town.
 *
 * ?town=flora on the page URL skips the location step (handy for testing a specific board).
 */
(function () {
  var PROJECT   = "skventuresigns-c35d5";
  var API_KEY   = "AIzaSyCVff98TiQjhjSFrLm_0kMGZ5NlrVTPM7g";
  var BASE      = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/";
  var MAX_MILES = 100;               // farther than this and we keep the placeholder
  var LOCATIONS_PAGE = "./Locations.html";

  var ACTIVE = ["active", "true", "yes", "1", "on", "enabled"];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function miles(aLat, aLng, bLat, bLng) {
    var r = 3958.8, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  function getJSON(url) {
    return fetch(url).then(function (r) { return r.json(); });
  }

  // One call, no listing of the whole collection: ask Firestore for this town's ads only.
  function townAds(townKey) {
    var body = {
      structuredQuery: {
        from: [{ collectionId: "skventure_ads" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "location" },
            op: "EQUAL",
            value: { stringValue: townKey }
          }
        }
      }
    };
    return fetch(BASE + ":runQuery?key=" + API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function field(fields, name) {
    var v = fields && fields[name];
    if (!v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("doubleValue" in v) return v.doubleValue;
    if ("integerValue" in v) return Number(v.integerValue);
    return null;
  }

  function playableNow(fields) {
    var status = String(field(fields, "status") || "").toLowerCase();
    if (field(fields, "removedFromSheet") === true) return false;
    if (ACTIVE.indexOf(status) < 0) return false;
    if (!String(field(fields, "imageUrl") || "").trim()) return false;
    var end = String(field(fields, "expirationDate") || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end) && end < todayISO()) return false;
    return true;
  }

  function adsFrom(result) {
    var out = [];
    (result || []).forEach(function (row) {
      if (!row || !row.document) return;
      var f = row.document.fields || {};
      if (playableNow(f)) out.push({ fields: f });
    });
    return out;
  }

  function nearestTown(lat, lng) {
    return getJSON(BASE + "skventure_locations?pageSize=100&key=" + API_KEY).then(function (res) {
      var best = null;
      (res.documents || []).forEach(function (d) {
        var f = d.fields || {};
        var tLat = field(f, "lat"), tLng = field(f, "lng");
        if (tLat == null || tLng == null) return;
        var m = miles(lat, lng, tLat, tLng);
        if (!best || m < best.miles) {
          best = { key: d.name.split("/").pop(), name: field(f, "name") || d.name.split("/").pop(), miles: m };
        }
      });
      return best;
    });
  }

  function build(host) {
    host.innerHTML = "";
    var card = el("div", "skvad-card");
    var media = el("div", "skvad-media");
    var placeholder = el("div", "skvad-ph", "S&K Venture Signs");
    media.appendChild(placeholder);

    var caption = el("div", "skvad-caption", "");
    var title = el("h2", "skvad-title", "Advertising");
    var sub = el("p", "skvad-sub", "Ensure your message reaches the right audience at the right time.");
    var near = el("button", "skvad-near", "\uD83D\uDCCD Use my location");
    near.type = "button";
    var cta = el("a", "skvad-cta", "AVAILABLE LOCATIONS");
    cta.href = LOCATIONS_PAGE;

    card.appendChild(media);
    card.appendChild(caption);
    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(near);
    card.appendChild(cta);
    host.appendChild(card);

    return { media: media, placeholder: placeholder, caption: caption, near: near };

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
  }

  function showAd(ui, ad, town) {
    var url = String(field(ad.fields, "imageUrl") || "");
    var who = String(field(ad.fields, "advertiser") || "");
    var img = document.createElement("img");
    img.className = "skvad-img";
    img.alt = who || "Ad running on an S&K Venture Signs board";
    img.loading = "lazy";
    img.onload = function () {
      ui.placeholder.style.display = "none";
      ui.caption.textContent = "Now running in " + town;
    };
    img.onerror = function () { img.remove(); };      // worse case: the placeholder stays
    img.src = url;
    ui.media.appendChild(img);
  }

  function run(host, ui) {
    var forced = (new URLSearchParams(location.search).get("town") || "").trim().toLowerCase();

    function loadTown(townKey, townName, note) {
      ui.caption.textContent = "Looking for ads near you\u2026";
      townAds(townKey).then(function (res) {
        var ads = adsFrom(res);
        if (!ads.length) {
          ui.caption.textContent = note || ("No ad is running in " + townName + " right now.");
          return;
        }
        showAd(ui, ads[Math.floor(Math.random() * ads.length)], townName);
      }).catch(function () { ui.caption.textContent = ""; });
    }

    if (forced) {                                     // ?town=flora - test a board directly
      ui.near.style.display = "none";
      loadTown(forced, forced.replace(/\b\w/g, function (c) { return c.toUpperCase(); }));
      return;
    }

    ui.near.addEventListener("click", function () {
      if (!navigator.geolocation) { ui.caption.textContent = "This browser cannot share a location."; return; }
      ui.near.disabled = true;
      ui.caption.textContent = "Asking your browser for your location\u2026";
      navigator.geolocation.getCurrentPosition(function (pos) {
        ui.near.style.display = "none";
        nearestTown(pos.coords.latitude, pos.coords.longitude).then(function (town) {
          if (!town || town.miles > MAX_MILES) {
            ui.caption.textContent = "No S&K board near you yet \u2014 browse the locations below.";
            return;
          }
          loadTown(town.key, town.name);
        }).catch(function () { ui.caption.textContent = ""; });
      }, function () {
        ui.near.disabled = false;
        ui.caption.textContent = "Location off \u2014 browse the locations below.";
      }, { timeout: 10000, maximumAge: 600000 });
    });
  }

  function start() {
    var hosts = document.querySelectorAll("#skv-ad-card, [data-skv-ad-card]");
    Array.prototype.forEach.call(hosts, function (host) {
      var ui = build(host);
      run(host, ui);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
