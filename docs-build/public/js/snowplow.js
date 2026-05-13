/*
 * Anonymous Snowplow page-view tracking for the docs site.
 *
 * Mirrors the marketing site's `anonymous-snowplow.js` so docs page views
 * land in the same `sp.metabase.com` stream the rest of metabase.com is
 * already reporting to. `withServerAnonymisation: true` + `stateStorageStrategy:
 * "none"` means no client-side cookies or localStorage and the IP is dropped
 * server-side, so this runs without a cookie-consent banner.
 *
 * The marketing site also conditionally loads the heavier `marketing-snowplow.js`
 * (cookies + identifiable session tracking) once the user accepts marketing
 * cookies. We don't carry the consent flow yet — if we want richer docs
 * analytics later, that's the layer to add.
 *
 * `redirectTo` is the URL normalizer the marketing site lives in
 * `_includes/globals.js`. We inline it here so the script has no external
 * dependency inside the docs build.
 */
(function () {
  // URL normalizer: strip /index.html, .html, /index suffixes so that
  // /docs/latest/foo.html and /docs/latest/foo report as the same page.
  window.redirectTo = window.redirectTo || function redirectTo(theLocation) {
    if (typeof theLocation === "string") {
      try { theLocation = new URL(theLocation); } catch (_) { return null; }
    }
    var suffixes = ["/index.html", ".html", "/index"];
    for (var i = 0; i < suffixes.length; i++) {
      var suffix = suffixes[i];
      if (
        theLocation.pathname &&
        theLocation.pathname.length > suffix.length &&
        theLocation.pathname.indexOf(suffix) === theLocation.pathname.length - suffix.length
      ) {
        var pathname = theLocation.pathname.replace(suffix, "");
        if (pathname[pathname.length - 1] === "/") pathname = pathname.slice(0, -1);
        return pathname + theLocation.search + theLocation.hash;
      }
    }
    return null;
  };

  // Snowplow loader stub — same shape as the official sp.js loader.
  (function (p, l, o, w, i, n, g) {
    if (!p[i]) {
      p.GlobalSnowplowNamespace = p.GlobalSnowplowNamespace || [];
      p.GlobalSnowplowNamespace.push(i);
      p[i] = function () { (p[i].q = p[i].q || []).push(arguments); };
      p[i].q = p[i].q || [];
      n = l.createElement(o);
      g = l.getElementsByTagName(o)[0];
      n.async = 1;
      n.src = w;
      g.parentNode.insertBefore(n, g);
    }
  })(
    window,
    document,
    "script",
    "//cdn.jsdelivr.net/gh/snowplow/sp-js-assets@2.18.0/sp.min.js",
    "snowplowanon",
  );

  window.snowplowanon("newTracker", "anon", "sp.metabase.com", {
    appId: "anon-www",
    platform: "web",
    anonymousTracking: { withServerAnonymisation: true },
    stateStorageStrategy: "none",
    eventMethod: "post",
    contexts: {
      webPage: true,
      performanceTiming: false,
    },
  });

  // Use the normalized URL (without /index.html etc) for the page view.
  var formattedCustomUrl = window.redirectTo(window.location);
  if (formattedCustomUrl) {
    window.snowplowanon("setCustomUrl", formattedCustomUrl);
  }

  // Preserve the referrer when the user navigated within metabase.com.
  if (
    document.referrer &&
    (document.referrer.indexOf("https://www.metabase.com") > -1 ||
      document.referrer.indexOf("https://metabase.com") > -1)
  ) {
    var formattedReferrerUrl = window.redirectTo(document.referrer);
    if (formattedReferrerUrl) {
      window.snowplowanon(
        "setReferrerUrl",
        window.location.origin + formattedReferrerUrl,
      );
    }
  }

  window.snowplowanon("trackPageView");
})();
