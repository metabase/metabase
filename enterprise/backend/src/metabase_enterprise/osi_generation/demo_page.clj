(ns metabase-enterprise.osi-generation.demo-page
  "Browser-facing routes packaged on the OSI demo branch for local and PR-environment demos."
  (:require
   [clojure.java.io :as io]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.config.core :as config]))

(defn- resource-response
  [path content-type]
  (api/check-404 (or (and config/dev-available? (not *compile-files*))
                     (config/config-bool :mb-enable-osi-generation-demo)))
  (api/check-superuser)
  (let [resource (api/check-404 (io/resource path))]
    {:status  200
     :headers {"Content-Type"                 content-type
               "Cache-Control"                "no-store"
               "X-Content-Type-Options"       "nosniff"
               "Content-Security-Policy"      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'"
               "Cross-Origin-Resource-Policy" "same-origin"}
     :body    (slurp resource)}))

(api.macros/defendpoint :get "/" :- :any
  "Serve the OSI generation demo control surface."
  []
  (resource-response "metabase_enterprise/osi_generation/demo/osi_generation.html" "text/html; charset=utf-8"))

(api.macros/defendpoint :get "/app.css" :- :any
  "Serve styles for the OSI generation demo."
  []
  (resource-response "metabase_enterprise/osi_generation/demo/osi_generation.css" "text/css; charset=utf-8"))

(api.macros/defendpoint :get "/app.js" :- :any
  "Serve JavaScript for the OSI generation demo."
  []
  (resource-response "metabase_enterprise/osi_generation/demo/osi_generation.js" "application/javascript; charset=utf-8"))

(def ^{:arglists '([request respond raise])} routes
  "`/dev/osi-generation` browser routes."
  (api.macros/ns-handler *ns* +auth))
