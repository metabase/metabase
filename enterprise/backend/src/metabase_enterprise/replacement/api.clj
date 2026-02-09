(ns metabase-enterprise.replacement.api
  "`/api/ee/replacement/` routes"
  (:require
   [metabase-enterprise.replacement.source :as replacement.source]
   [metabase-enterprise.replacement.source-swap :as replacement.source-swap]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private entity-type-enum
  [:enum :card :table])

(defn- fetch-source
  "Fetch source metadata and its database ID. Cards are available from any metadata provider,
  so we use the source entity's provider. Tables are database-scoped, so we look up the db_id
  first."
  [entity-type entity-id]
  (case entity-type
    :card  (let [mp   (lib-be/application-database-metadata-provider
                       (t2/select-one-fn :database_id :model/Card :id entity-id))
                 card (lib.metadata/card mp entity-id)]
             {:mp mp :source card :database-id (:database-id card)})
    :table (let [db-id (t2/select-one-fn :db_id :model/Table :id entity-id)
                 mp    (lib-be/application-database-metadata-provider db-id)
                 table (lib.metadata/table mp entity-id)]
             {:mp mp :source table :database-id (:db-id table)})))

(mr/def ::column
  [:map
   [:name          :string]
   [:effective_type :string]
   [:semantic_type  [:maybe :string]]
   [:database_type  :string]])

(mr/def ::type-mismatch
  [:map
   [:name          :string]
   [:source_column ::column]
   [:target_column ::column]])

(mr/def ::fk-target-mismatch
  [:map
   [:name             :string]
   [:source_column    ::column]
   [:target_column    ::column]
   [:source_fk_target ms/IntGreaterThanOrEqualToZero]
   [:target_fk_target ms/IntGreaterThanOrEqualToZero]])

(mr/def ::error
  [:map
   [:type [:enum :database-mismatch :column-mismatch :column-type-mismatch :pk-mismatch :fk-mismatch]]
   [:missing_columns      {:optional true} [:sequential ::column]]
   [:extra_columns        {:optional true} [:sequential ::column]]
   [:columns              {:optional true} [:sequential ::type-mismatch]]
   [:fk_target_mismatches {:optional true} [:sequential ::fk-target-mismatch]]])

(mr/def ::check-replace-source-response
  [:map
   [:success :boolean]
   [:errors  [:sequential ::error]]])

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
  (let [{source-mp :mp old-source :source source-db :database-id} (fetch-source source_entity_type source_entity_id)
        {new-source :source target-db :database-id}              (fetch-source target_entity_type target_entity_id)
        errors (if (not= source-db target-db)
                 [{:type :database-mismatch}]
                 (replacement.source/check-replace-source source-mp old-source new-source))]
    {:success (empty? errors)
     :errors  errors}))

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
  ;; TODO: call check-replace-source in some manner to check that the sources are swappable
  (replacement.source-swap/swap-source [source_entity_type source_entity_id] [target_entity_type target_entity_id]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/replacement` routes."
  (api.macros/ns-handler *ns* +auth))
