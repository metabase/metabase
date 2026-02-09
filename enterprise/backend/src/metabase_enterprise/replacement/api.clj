(ns metabase-enterprise.replacement.api
  "`/api/ee/replacement/` routes"
  (:require
   [metabase-enterprise.replacement.source :as replacement.source]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private source-schema
  [:map
   [:type [:enum "card" "table"]]
   [:id   ms/PositiveInt]])

(defn- fetch-source [mp {:keys [type id]}]
  (case type
    "card"  (lib.metadata/card mp id)
    "table" (lib.metadata/table mp id)))

(api.macros/defendpoint :post "/can-swap-source" :- [:map [:can_swap :boolean]]
  "Check whether two sources are compatible for swapping. Returns `{:can_swap true}` if the
  old source can be replaced by the new source (i.e., they have the same number of columns
  with equivalent types)."
  [_route-params
   _query-params
   {:keys [database_id old_source new_source]}
   :- [:map
       [:database_id ms/PositiveInt]
       [:old_source  source-schema]
       [:new_source  source-schema]]]
  (let [mp         (lib-be/application-database-metadata-provider database_id)
        old-source (fetch-source mp old_source)
        new-source (fetch-source mp new_source)]
    {:can_swap (boolean (replacement.source/can-swap-source? mp old-source new-source))}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/replacement` routes."
  (api.macros/ns-handler *ns* +auth))
