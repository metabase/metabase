(ns metabase-enterprise.custom-viz-plugin.api.sandbox-host
  "The near-membrane sandbox donor endpoint, in its own namespace so it can be mounted without
  `+auth` (the whole-namespace `ns-handler` in `metabase-enterprise.custom-viz-plugin.api` cannot
  exempt a single endpoint). The donor is loaded as an iframe `src`, which cannot carry session
  headers."
  (:require
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

(def ^:private sandbox-host-html
  "Minimal HTML doc that the patched `@locker/near-membrane-dom` loads as the iframe document
   so plugin code can be `eval`'d under a relaxed, per-iframe CSP."
  "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>")

(def ^:private sandbox-host-csp
  "CSP applied ONLY to the sandbox iframe document.
   - `'unsafe-eval'` required by near-membrane to evaluate plugin code inside the realm.
   - `frame-ancestors 'self'` - so Metabase can embed this document."
  (str "default-src 'none'; "
       "script-src 'unsafe-eval'; "
       "frame-ancestors 'self';"))

(api.macros/defendpoint :get "/sandbox-host" :- :any
  "Serve a minimal HTML document used as the iframe `src` for the near-membrane custom-viz
   sandbox. The response carries a per-document `Content-Security-Policy` that permits
   `'unsafe-eval'` only inside this iframe, so the main Metabase document keeps its strict
   nonce-based CSP."
  []
  {:status  200
   :headers {"Content-Type"                 "text/html; charset=utf-8"
             "Content-Security-Policy"      sandbox-host-csp
             "X-Frame-Options"              "SAMEORIGIN"
             "X-Content-Type-Options"       "nosniff"
             "Cross-Origin-Resource-Policy" "same-origin"
             "Referrer-Policy"              "no-referrer"
             "Cache-Control"                "public, max-age=60"}
   :body    sandbox-host-html})

(def ^{:arglists '([request respond raise])} routes
  "Unauthed `/api/ee/custom-viz-plugin/sandbox-host` donor route, mounted alongside the
   session-authed custom-viz-plugin routes."
  (api.macros/ns-handler *ns*))
