(ns metabase-enterprise.library-branching.api
  (:require
   [metabase-enterprise.library-branching.manifest :as manifest]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/count" :- [:map-of (into [:enum] (sort scope/kinds)) nat-int?]
  "The number of items that library branching syncs, by kind. Superuser only."
  []
  (api/check-superuser)
  (scope/scope-count))

(api.macros/defendpoint :get "/manifest" :- [:map
                                             [:status [:= 200]]
                                             [:headers [:map-of :string :string]]
                                             [:body :string]]
  "The manifest of this instance as the YAML file that CI reads: its databases, schemas, tables and fields, with
  their types. No data and no connection details. Superuser only."
  []
  (api/check-superuser)
  {:status  200
   :headers {"Content-Type" "application/yaml; charset=utf-8"}
   :body    (String. (manifest/manifest-yaml) java.nio.charset.StandardCharsets/UTF_8)})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library-branching` routes."
  (api.macros/ns-handler *ns* +auth))
