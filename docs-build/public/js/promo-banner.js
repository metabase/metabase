/*
 * Minimal promo-banner controller for the docs site.
 *
 * The marketing site's promo-banner.js does a lot more (countdown timers,
 * Snowplow analytics, landing-page detection) but for the docs we only need
 * the dismiss button to work and to remember the dismissal across reloads.
 *
 * The chrome snapshot leaves the banner visible by default; this script just
 * checks localStorage on load (hide if dismissed within the last 7 days) and
 * wires the close button to add the slide-up class then remove the node.
 */
(function () {
  var STORAGE_KEY = "metabase-docs-promo-banner-dismissed-until";

  function getBanner() {
    return document.querySelector(".promo-banner");
  }

  function isDismissed() {
    try {
      var until = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
      return until > Date.now();
    } catch (_) {
      return false;
    }
  }

  function dismiss() {
    var banner = getBanner();
    if (!banner) return;
    var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + sevenDaysMs));
    } catch (_) {
      /* private mode: ignore */
    }
    banner.classList.add("no-height");
    setTimeout(function () { banner.remove(); }, 350);
  }

  window.addEventListener("DOMContentLoaded", function () {
    var banner = getBanner();
    if (!banner) return;
    if (isDismissed()) {
      banner.remove();
      return;
    }
    var button = banner.querySelector("button");
    if (button) button.addEventListener("click", dismiss);
  });
})();
