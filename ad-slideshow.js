/*
 * ad-slideshow.js  --  turns the home page's "Advertising" service picture into a slideshow of the
 * ads that are actually running on S&K boards right now.
 *
 * Any <img data-ad-card="1"> on the page is used as the screen. The ads come from the Realtime
 * Database (billboard/v1/towns), the same list the billboard screens play, and only ads that are
 * running today are used (active, not retired, not past the end date). It crossfades every few
 * seconds and stops on the last one if only one ad is running. Clicking the picture still opens
 * the lightbox with whatever is showing.
 *
 * If the database cannot be reached, the picture that was already there stays untouched.
 */
(function () {
  var TOWNS     = "https://skventuresigns-c35d5-default-rtdb.firebaseio.com/billboard/v1/towns.json";
  var EVERY_MS  = 6000;
  var ACTIVE    = ["active", "true", "yes", "1", "on", "enabled"];

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function playable(a) {
    if (!a || typeof a !== "object") return false;
    if (a.removedFromSheet === true) return false;
    if (ACTIVE.indexOf(String(a.status || "").trim().toLowerCase()) < 0) return false;
    if (!String(a.url || a.imageUrl || "").trim()) return false;
    var end = String(a.endDate || a.expirationDate || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end) && end < todayISO()) return false;
    return true;
  }

  function poolFrom(towns) {
    var urls = [];
    Object.keys(towns || {}).forEach(function (k) {
      var t = towns[k];
      if (!t || typeof t !== "object") return;
      (t.ads || []).filter(playable).forEach(function (a) {
        var u = String(a.url || a.imageUrl || "").trim();
        if (u && urls.indexOf(u) < 0) urls.push(u);
      });
    });
    return urls;
  }

  function rotate(img, urls) {
    if (!urls.length) return;
    if (urls.length === 1) { img.src = urls[0]; return; }

    var i = 0;
    img.style.transition = "opacity .6s ease";
    img.src = urls[0];

    setInterval(function () {
      i = (i + 1) % urls.length;
      img.style.opacity = "0";
      setTimeout(function () {
        img.src = urls[i];                  // the lightbox picks this up through the same element
        img.style.opacity = "1";
      }, 600);
    }, EVERY_MS);
  }

  function start() {
    fetch(TOWNS, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("rtdb " + r.status); return r.json(); })
      .then(function (data) {
        var urls = poolFrom(data);
        if (!urls.length) throw new Error("no ads running");
        // the service cards are built after this page loads, so wait for the picture to appear
        var tries = 0;
        (function look() {
          var imgs = document.querySelectorAll('img[data-ad-card="1"]');
          if (imgs.length) {
            Array.prototype.forEach.call(imgs, function (img) {
              if (img.dataset.slideshow === "1") return;
              img.dataset.slideshow = "1";
              rotate(img, urls);
            });
            return;
          }
          if (++tries < 60) setTimeout(look, 500);      // give up after 30 seconds
        })();
      })
      .catch(function () { /* keep the original picture */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
