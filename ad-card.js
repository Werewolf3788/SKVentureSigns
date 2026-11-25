/*
 * ad-card.js  --  the "Advertising" card, but it shows a real ad from a live S&K board.
 *
 * PUT IT ON A PAGE WITH:
 *     <div id="skv-ad-card"></div>
 *     <script src="./ad-card.js" defer></script>
 *
 * WHAT IT DOES
 *   1. Reads the boards and their ads from the Realtime Database (billboard/v1/towns) --
 *      the same tree the billboard screens and the Locations page use.
 *   2. Shows a real ad straight away: the one running in the nearest board if the visitor shares
 *      their location, otherwise the ads that are actually running today rotate every 10 seconds.
 *   3. "Use my location" narrows it to the closest board (the browser asks first; nothing is
 *      sent or stored anywhere -- the coordinates stay in the browser and pick a town).
 *   4. Only shows ads that are running today: status active, not retired, not past its end date.
 *      If there are no ads at all, the grey placeholder stays and the button still works.
 *
 * ?town=flora on the page URL pins it to one board (handy for testing).
 */
(function () {
  var RTDB      = "https://skventuresigns-c35d5-default-rtdb.firebaseio.com";
  var TOWNS     = RTDB + "/billboard/v1/towns.json";
  var MAX_MILES = 100;
  var ROTATE_MS = 10000;
  var CTA_URL   = "./Locations.html";

  var ACTIVE = ["active", "true", "yes", "1", "on", "enabled"];

  /* ---------- small helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function miles(aLat, aLng, bLat, bLng) {
    var R = 3958.8, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function titleCase(s) {
    return String(s || "").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /* ---------- data ---------- */
  function playable(ad) {
    if (!ad || typeof ad !== "object") return false;
    if (ad.removedFromSheet === true) return false;
    if (ACTIVE.indexOf(String(ad.status || "").trim().toLowerCase()) < 0) return false;
    if (!String(ad.url || ad.imageUrl || "").trim()) return false;
    var end = String(ad.endDate || ad.expirationDate || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end) && end < todayISO()) return false;
    return true;
  }
  function townCoords(screens) {
    for (var i = 0; i < screens.length; i++) {
      var lat = parseFloat(screens[i].lat), lng = parseFloat(screens[i].lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        if (Math.abs(lat) > 50 && Math.abs(lng) < 50) { var t = lat; lat = lng; lng = t; }  // swapped columns
        return { lat: lat, lng: lng };
      }
    }
    return null;
  }
  function readTowns(towns) {
    var list = [];
    Object.keys(towns || {}).forEach(function (key) {
      var t = towns[key];
      if (!t || typeof t !== "object") return;
      var ads = (t.ads || []).filter(playable).map(function (a) {
        return {
          advertiser: a.advertiser || "",
          url: a.url || a.imageUrl || "",
          townKey: key,
          townName: t.name || titleCase(key)
        };
      });
      if (!ads.length) return;
      list.push({
        key: key,
        name: t.name || titleCase(key),
        coords: townCoords(t.screens || []),
        ads: ads
      });
    });
    return list;
  }

  /* ---------- styles (loaded once, so the card works on any page) ---------- */
  function style() {
    if (document.getElementById("skvad-style")) return;
    var s = document.createElement("style");
    s.id = "skvad-style";
    s.textContent =
      ".skvad-card{width:100%;max-width:430px;background:#fff;border-radius:18px;padding:18px 18px 22px;" +
      "box-shadow:0 18px 40px rgba(0,0,0,.35);text-align:center;box-sizing:border-box;margin:0 auto;" +
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".skvad-media{position:relative;width:100%;aspect-ratio:4/3;background:#c9c9c9;border-radius:8px;" +
      "overflow:hidden;display:flex;align-items:center;justify-content:center}" +
      ".skvad-ph{color:#9a9a9a;font-size:clamp(18px,5vw,30px);font-weight:600;letter-spacing:.5px}" +
      ".skvad-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;" +
      "opacity:0;transition:opacity .5s ease}" +
      ".skvad-img.on{opacity:1}" +
      ".skvad-caption{min-height:18px;margin:10px 0 0;font-size:12px;color:#8a6a3c;letter-spacing:.2px}" +
      ".skvad-title{margin:8px 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#111}" +
      ".skvad-sub{margin:0 0 6px;font-size:13.5px;line-height:1.45;color:#7d7d7d}" +
      ".skvad-near{border:0;background:none;color:#8a6a3c;font:inherit;font-size:12.5px;text-decoration:underline;" +
      "cursor:pointer;padding:6px 4px;margin-bottom:8px}" +
      ".skvad-near[disabled]{opacity:.6;cursor:default}" +
      ".skvad-cta{display:block;margin-top:6px;padding:14px 18px;border-radius:999px;background:#4a0b0b;color:#fff;" +
      "font-weight:800;font-size:13px;letter-spacing:1.4px;text-decoration:none;border:3px solid #f2c744;" +
      "box-sizing:border-box;font-family:'Poppins',system-ui,sans-serif}" +
      ".skvad-cta:hover{background:#611010}";
    document.head.appendChild(s);
  }

  /* ---------- the card ---------- */
  function build(host) {
    host.innerHTML = "";
    var card = el("div", "skvad-card");
    var media = el("div", "skvad-media");
    var placeholder = el("div", "skvad-ph", "S&K Venture Signs");
    media.appendChild(placeholder);

    var caption = el("div", "skvad-caption", "");
    var near = el("button", "skvad-near", "\uD83D\uDCCD Use my location");
    near.type = "button";
    var cta = el("a", "skvad-cta", "AVAILABLE LOCATIONS");
    cta.href = CTA_URL;

    card.appendChild(media);
    card.appendChild(caption);
    card.appendChild(el("h2", "skvad-title", "Advertising"));
    card.appendChild(el("p", "skvad-sub", "Ensure your message reaches the right audience at the right time."));
    card.appendChild(near);
    card.appendChild(cta);
    host.appendChild(card);

    return { media: media, placeholder: placeholder, caption: caption, near: near };
  }

  function showAd(ui, ad, note) {
    var img = document.createElement("img");
    img.className = "skvad-img";
    img.alt = ad.advertiser || "Ad running on an S&K Venture Signs board";
    img.onload = function () {
      ui.placeholder.style.display = "none";
      ui.media.querySelectorAll(".skvad-img").forEach(function (old) {
        if (old !== img) {
          old.classList.remove("on");
          setTimeout(function () { old.remove(); }, 600);
        }
      });
      requestAnimationFrame(function () { img.classList.add("on"); });
      if (note) ui.caption.textContent = note;
    };
    img.onerror = function () { img.remove(); };      // worst case: the placeholder stays
    img.src = ad.url;
    ui.media.appendChild(img);
  }

  function run(host, ui) {
    var forced = (new URLSearchParams(location.search).get("town") || "").trim().toLowerCase();
    var allAds = [], byTown = {}, rotator = null, at = 0;

    function narrate(list, note) {
      if (!list || !list.length) return false;
      showAd(ui, list[at % list.length], note);
      at++;
      return true;
    }
    function startRotation(list) {
      if (rotator) clearInterval(rotator);
      if (list.length < 2) return;
      rotator = setInterval(function () {
        narrate(list, null);
      }, ROTATE_MS);
    }

    function useTown(town) {
      if (rotator) { clearInterval(rotator); rotator = null; }
      if (!town) return false;
      return narrate(town.ads, "Now running in " + town.name + " \u2014 your closest board");
    }

    readTownsFromDb().then(function (towns) {
      allAds = towns.reduce(function (a, t) { return a.concat(t.ads); }, []);
      towns.forEach(function (t) { byTown[t.key] = t; });

      if (forced) {                                    // ?town=flora - pin one board
        ui.near.style.display = "none";
        var t = byTown[forced];
        if (t) { narrate(t.ads, "Now running in " + t.name); return; }
      }

      // real ad immediately, no permission needed
      if (narrate(allAds, allAds.length ? "Now running on an S&K board" : "")) {
        startRotation(allAds);
      } else {
        ui.caption.textContent = "No ad is running right now.";
      }

      ui.near.addEventListener("click", function () {
        if (!navigator.geolocation) { ui.caption.textContent = "This browser cannot share a location."; return; }
        ui.near.disabled = true;
        ui.caption.textContent = "Asking your browser for your location\u2026";
        navigator.geolocation.getCurrentPosition(function (pos) {
          ui.near.style.display = "none";
          var best = null;
          towns.forEach(function (t) {
            if (!t.coords) return;
            var m = miles(pos.coords.latitude, pos.coords.longitude, t.coords.lat, t.coords.lng);
            if (!best || m < best.miles) best = { town: t, miles: m };
          });
          if (!best || best.miles > MAX_MILES) {
            ui.caption.textContent = "No S&K board near you yet \u2014 browse the locations below.";
            return;
          }
          if (!useTown(best.town)) ui.caption.textContent = "No ad is running in " + best.town.name + " right now.";
        }, function () {
          ui.near.disabled = false;
          ui.caption.textContent = "Location off \u2014 showing ads that are running now.";
        }, { timeout: 10000, maximumAge: 600000 });
      });
    }).catch(function () {
      ui.caption.textContent = "";                     // leave the placeholder in place
    });
  }

  function readTownsFromDb() {
    return fetch(TOWNS, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("rtdb " + r.status);
      return r.json();
    }).then(function (data) {
      var towns = readTowns(data);
      if (!towns.length) throw new Error("no ads in the database");
      return towns;
    });
  }

  function start() {
    style();
    Array.prototype.forEach.call(document.querySelectorAll("#skv-ad-card, [data-skv-ad-card]"), function (host) {
      run(host, build(host));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
