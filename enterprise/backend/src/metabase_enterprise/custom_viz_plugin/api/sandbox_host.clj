(ns metabase-enterprise.custom-viz-plugin.api.sandbox-host
  "Unauthed donor endpoint for the near-membrane custom-viz sandbox.

  The donor is loaded as an iframe `src`, which carries no headers and, in EAJS (iframe) embedding,
  no first-party cookies either, so it cannot be session-authed. The document is inert: no scripts,
  no data. The only capability it grants is `'unsafe-eval'` confined to its own realm.

  Because it is unauthed it must stay inert: never add content, data, or parameters to this endpoint.
  The response body and headers are pinned exactly by a test to make that hard to do by accident.

  `frame-ancestors` is `*` rather than an allowlist: EAJS has no embedding-origin allowlist to check
  against (the embed page itself is served with `frame-ancestors *`), and the customer page must be
  an allowed ancestor of the donor iframe.

  Fetch-metadata gate: browsers attach `Sec-Fetch-*` headers that page JS cannot forge, so the
  endpoint 404s any browser-attested load that is not a same-origin iframe navigation. That keeps
  this from being a reusable public utility (no hotlinking, no top-level tabs, no cross-site
  framing of the donor URL itself); it is resource isolation, not authentication. A session-authed
  (core-app) caller is additionally allowed when the browser sends no fetch metadata at all, so
  older browsers that predate Fetch Metadata keep working; a present cross-site attestation is
  rejected even for authed callers, so an authenticated user cannot be made to frame the donor from
  an attacker's page. EAJS (unauthed) callers must always send an attested same-origin iframe load."
  (:require
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

(def ^:private sandbox-host-html
  "Minimal HTML doc that the patched `@locker/near-membrane-dom` loads as the iframe document
   so plugin code can be `eval`'d under a relaxed, per-iframe CSP."
  "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>")

(def ^:private sandbox-host-csp
  "CSP applied ONLY to the sandbox iframe document.
   - `'unsafe-eval'` required by near-membrane to evaluate plugin code inside the realm.
   - `frame-ancestors *` instead of `X-Frame-Options`, so EAJS customer pages can frame it too."
  "default-src 'none'; script-src 'unsafe-eval'; frame-ancestors *;")

(defn- sec-fetch-same-origin-iframe?
  "True when the browser attests this is a same-origin iframe navigation, the one way EAJS loads
   the donor. `Sec-Fetch-*` headers cannot be forged by page JS."
  [{:keys [headers]}]
  (and (= (get headers "sec-fetch-site") "same-origin")
       (= (get headers "sec-fetch-dest") "iframe")))

(defn- sec-fetch-absent?
  "True when the request carries no fetch-metadata headers at all, e.g. an older browser that
   predates Fetch Metadata."
  [{:keys [headers]}]
  (and (nil? (get headers "sec-fetch-site"))
       (nil? (get headers "sec-fetch-dest"))))

(defn- donor-load-allowed?
  "Whether to serve the donor. Core-app (session-authed) callers may load it when the browser
   sends no fetch metadata (older browsers) or attests a same-origin iframe; a present cross-site
   attestation is rejected even when authed, so an authenticated user cannot be made to frame the
   donor from an attacker's page. EAJS (unauthed) callers must always send an attested same-origin
   iframe navigation."
  [request]
  (if (:metabase-user-id request)
    (or (sec-fetch-absent? request)
        (sec-fetch-same-origin-iframe? request))
    (sec-fetch-same-origin-iframe? request)))

(api.macros/defendpoint :get "/sandbox-host" :- :any
  "Serve a minimal HTML document used as the iframe `src` for the near-membrane custom-viz
   sandbox. The response carries a per-document `Content-Security-Policy` that permits
   `'unsafe-eval'` only inside this iframe, so the main Metabase document keeps its strict
   nonce-based CSP. 404s unless the custom-viz kill switch is on and the request passes the
   fetch-metadata gate (see [[donor-load-allowed?]])."
  [_route-params _query-params _body request]
  (if-not (and (custom-viz.settings/enable-custom-viz?)
               (donor-load-allowed? request))
    {:status  404
     :headers {"Content-Type"  "text/plain; charset=utf-8"
               "Cache-Control" "no-store"}
     :body    "Not found"}
    {:status  200
     :headers {"Content-Type"                 "text/html; charset=utf-8"
               "Content-Security-Policy"      sandbox-host-csp
               ;; nil drops the header: the global security middleware would otherwise inject
               ;; X-Frame-Options: DENY, which blocks the cross-origin framing EAJS needs.
               "X-Frame-Options"              nil
               "X-Content-Type-Options"       "nosniff"
               "Cross-Origin-Resource-Policy" "same-origin"
               "Referrer-Policy"              "no-referrer"
               ;; no-store, not a shared/public cache: the 200-vs-404 split depends on the
               ;; Sec-Fetch metadata and the session, which a URL-keyed cache can't see, so a
               ;; cached 200 would otherwise be replayed to requests the gate meant to 404.
               "Cache-Control"                "no-store"}
     :body    sandbox-host-html}))

(def ^{:arglists '([request respond raise])} routes
  "Unauthed `/api/ee/custom-viz-plugin/sandbox-host` donor route, mounted alongside the
   session-authed custom-viz-plugin routes."
  (api.macros/ns-handler *ns*))
