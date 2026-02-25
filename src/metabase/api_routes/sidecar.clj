(ns metabase.api-routes.sidecar
  "Limited API route map for local sidecar mode. Only includes routes needed
  by local dev tools (VS Code extension, etc.)."
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common :refer [+auth]]
   [metabase.api.util]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections-rest.api]
   [metabase.dashboards-rest.api]
   [metabase.eid-translation.api]
   [metabase.measures.api]
   [metabase.queries-rest.api]
   [metabase.transforms-rest.api.transform]
   [metabase.users-rest.api]
   [metabase.warehouse-schema-rest.api]
   [metabase.warehouses-rest.api]))

(comment metabase.api.util/keep-me
         metabase.collections-rest.api/keep-me
         metabase.dashboards-rest.api/keep-me
         metabase.eid-translation.api/keep-me
         metabase.measures.api/keep-me
         metabase.queries-rest.api/keep-me
         metabase.transforms-rest.api.transform/keep-me
         metabase.users-rest.api/keep-me
         metabase.warehouse-schema-rest.api/keep-me
         metabase.warehouses-rest.api/keep-me)

(defn- ->handler [x]
  (cond-> x
    (simple-symbol? x) api.macros/ns-handler))

(defn- +auth* [handler] (+auth (->handler handler)))

(defn- +methods
  "Wrap handler to only allow the given HTTP methods. Returns 405 for others."
  [handler allowed-methods]
  (fn [request respond raise]
    (if (contains? allowed-methods (:request-method request))
      (handler request respond raise)
      (respond {:status  405
                :headers {"Allow" (str/join ", " (map (comp str/upper-case name) allowed-methods))}
                :body    "Method Not Allowed"}))))

(defn- +get-only
  "Wrap handler to only allow GET requests."
  [handler]
  (+methods handler #{:get}))

;;; ↓↓↓ KEEP THIS SORTED ↓↓↓
(def ^:private route-map
  {"/card"            (+get-only (+auth* metabase.queries-rest.api/card-routes))
   "/cards"           (+get-only (+auth* metabase.queries-rest.api/cards-routes))
   "/collection"      (+get-only (+auth* 'metabase.collections-rest.api))
   "/dashboard"       (+get-only (+auth* 'metabase.dashboards-rest.api))
   "/database"        (+get-only (+auth* 'metabase.warehouses-rest.api))
   "/eid-translation" (+get-only 'metabase.eid-translation.api)
   "/field"           (+get-only (+auth* metabase.warehouse-schema-rest.api/field-routes))
   "/measure"         (+get-only (+auth* 'metabase.measures.api))
   "/table"           (+get-only (+auth* metabase.warehouse-schema-rest.api/table-routes))
   "/transform"       (+get-only (+auth* metabase.transforms-rest.api.transform/routes))
   "/transform-job"   (+get-only (+auth* metabase.transforms-rest.api.transform/transform-job-routes))
   "/transform-tag"   (+get-only (+auth* metabase.transforms-rest.api.transform/transform-tag-routes))
   "/user"            (+get-only (+auth* 'metabase.users-rest.api))
   "/util"            (+get-only 'metabase.api.util)})
;;; ↑↑↑ KEEP THIS SORTED ↑↑↑

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the sidecar API -- a limited subset of the full Metabase API."
  (handlers/route-map-handler route-map))
