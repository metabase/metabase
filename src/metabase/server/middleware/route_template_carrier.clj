(ns metabase.server.middleware.route-template-carrier
  (:require
   [metabase.api.macros :as api.macros]))

(defn wrap-route-template-carrier
  "Installs a fresh `volatile!` on every request under `api.macros/route-template-carrier-key`, so
  routing can record which route template matched (see [[api.macros/route-template-carrier-key]])
  for any middleware to read at respond time, not just `metabase.server.middleware.log/log-api-call`
  — which used to install this carrier itself, conditionally, only for API-key requests. Installing it
  unconditionally here costs one `volatile!` and one `assoc` per request, and lets a middleware that
  runs outside `log-api-call` (e.g. `metabase.server.middleware.trace/wrap-trace`, wanting the matched
  route as a span attribute) read the same carrier without touching routing itself."
  [handler]
  (fn [request respond raise]
    (handler (assoc request api.macros/route-template-carrier-key (volatile! nil)) respond raise)))
