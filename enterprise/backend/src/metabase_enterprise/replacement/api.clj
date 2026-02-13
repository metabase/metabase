(ns metabase-enterprise.replacement.api
  "`/api/ee/replacement/` routes"
  (:require
   [metabase-enterprise.replacement.source :as replacement.source]
   [metabase-enterprise.replacement.source-swap :as replacement.source-swap]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private entity-type-enum
  [:enum :card :table])

(mr/def ::column
  [:map
   [:name          :string]
   [:database_type :string]])

(mr/def ::error
  [:map
   [:type    [:enum :missing-column :column-type-mismatch :missing-primary-key :extra-primary-key :missing-foreign-key :foreign-key-mismatch]]
   [:columns [:sequential ::column]]])

(mr/def ::check-replace-source-response
  [:map
   [:success :boolean]
   [:errors  {:optional true} [:sequential ::error]]])

(api.macros/defendpoint :post "/check-replace-source" :- ::check-replace-source-response
  "Check whether a source entity can be replaced by a target entity. Returns compatibility
  errors describing column mismatches, type mismatches, primary key mismatches, and foreign
  key mismatches."
  [_route-params
   _query-params
   {:keys [source_entity_id source_entity_type target_entity_id target_entity_type]}
   :- [:map
       [:source_entity_id   ms/PositiveInt]
       [:source_entity_type entity-type-enum]
       [:target_entity_id   ms/PositiveInt]
       [:target_entity_type entity-type-enum]]]
  (let [errors (replacement.source/check-replace-source
                [source_entity_type source_entity_id]
                [target_entity_type target_entity_id])]
    (if (empty? errors)
      {:success true}
      {:success false :errors errors})))

(api.macros/defendpoint :post "/replace-source" :- :nil
  "Replace all usages of a particular table or card with a different table or card"
  [_route-params
   _query-params
   {:keys [source_entity_id source_entity_type target_entity_id target_entity_type]}
   :- [:map
       [:source_entity_id   ms/PositiveInt]
       [:source_entity_type entity-type-enum]
       [:target_entity_id   ms/PositiveInt]
       [:target_entity_type entity-type-enum]]]
  (let [errors (replacement.source/check-replace-source
                [source_entity_type source_entity_id]
                [target_entity_type target_entity_id])]
    (when (seq errors)
      (throw (ex-info "Sources are not replaceable" {:status-code 400
                                                     :errors errors}))))
  (replacement.source-swap/swap-source [source_entity_type source_entity_id] [target_entity_type target_entity_id]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/replacement` routes."
  (api.macros/ns-handler *ns* +auth))
