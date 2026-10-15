(ns metabase-enterprise.library-branching.api
  (:require
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library-branching` routes."
  (api.macros/ns-handler *ns* +auth))
