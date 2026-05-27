(ns metabase-enterprise.data-app-demo.api
  "Proof-of-concept /api/ee/data-app-demo endpoint.

   Serves a fixed JS bundle from the classpath resource `data_app_demo/index.js`.
   The bundle is plain JS (no JSX, no build step) that uses host-provided React
   via the data-app sandbox; the front-end loader fetches this endpoint,
   evaluates the bundle in a Near Membrane sandbox, and renders the React
   component the factory returns. Mirrors the custom-viz `:get \"/:id/bundle\"`
   endpoint shape but with a single hard-coded bundle."
  (:require
   [clojure.java.io :as io]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/bundle" :- :any
  "Serve the demo data-app JS bundle as `application/javascript`."
  [_route-params _query-params _body _request respond raise]
  (try
    (api/check-superuser)
    (if-let [resource (io/resource "data_app_demo/index.js")]
      (respond {:status  200
                :headers {"Content-Type"                 "application/javascript"
                          "X-Content-Type-Options"       "nosniff"
                          "Cross-Origin-Resource-Policy" "same-origin"
                          "Referrer-Policy"              "no-referrer"
                          "Cache-Control"                "no-store"}
                :body    (io/input-stream resource)})
      (respond {:status  404
                :headers {"Content-Type" "application/json"}
                :body    "{\"error\": \"Demo bundle not found on classpath\"}"}))
    (catch Throwable e
      (raise e))))

(def routes
  "`/api/ee/data-app-demo` routes."
  (api.macros/ns-handler *ns* +auth))
