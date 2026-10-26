(ns metabase-enterprise.near-membrane-plugin.api
  "Static evaluator document shared by custom viz and data apps.
   Requires enabled custom viz or a data apps feature token."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]))

(set! *warn-on-reflection* true)

(def ^:private sandbox-host-html
  "Minimal HTML doc that the patched `@locker/near-membrane-dom` loads as the iframe document
   so plugin code can be `eval`'d under a relaxed, per-iframe CSP."
  "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>")

(def ^:private sandbox-host-csp
  "CSP applied ONLY to the sandbox iframe document.
   - `'unsafe-eval'` required by near-membrane to evaluate plugin code inside the realm.
   - `frame-ancestors *` instead of `X-Frame-Options`, so EAJS customer pages can frame it too."
  "default-src 'none'; script-src 'unsafe-eval'; form-action 'none'; frame-ancestors *;")

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
  "Serve a minimal HTML document used as the iframe `src` for the near-membrane
   sandbox. The response carries a per-document `Content-Security-Policy` that permits
   `'unsafe-eval'` only inside this iframe, so the main Metabase document keeps its strict
   nonce-based CSP. 404s unless custom viz is enabled or the data apps feature token is present,
   and the request passes the fetch-metadata gate (see [[donor-load-allowed?]])."
  [_route-params _query-params _body request]
  (if-not (and (or (premium-features/enable-custom-viz?)
                   (premium-features/has-feature? :data-apps))
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
  "Unauthenticated evaluator routes shared by custom viz and data apps."
  (api.macros/ns-handler *ns*))
