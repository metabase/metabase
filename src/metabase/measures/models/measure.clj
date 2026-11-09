(ns metabase.measures.models.measure
  "A Measure is a saved MBQL 'macro', expanding to an `:aggregation` clause. It is tied to a table and contains
   exactly one aggregation expression."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.measure :as lib.schema.measure]
   [metabase.measures.db :as measures.db]
   [metabase.measures.schema :as measures.schema]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Measure [_model] :measure)
(methodical/defmethod t2/model-for-automagic-hydration [:default :measure] [_original-model _k] :model/Measure)

(defn- validate-mbql5-definition
  "Validate that a measure definition is in MBQL5 format.
  Throws an exception with 'Invalid measure definition' if the definition is not valid MBQL5."
  [definition]
  (when (seq definition)
    (when-not (= :mbql-version/mbql5 (when (map? definition)
                                       (u/ignore-exceptions (lib/normalized-mbql-version definition))))
      (throw (ex-info (tru "Invalid measure definition: expected MBQL5 format")
                      {:definition definition})))
    (mu/validate-throw ::lib.schema.measure/definition definition)))

(def ^:private transform-measure-definition
  "Transform for measure definitions. Handles JSON serialization/deserialization.
  Validation happens in before-insert and before-update hooks."
  {:in mi/json-in
   :out mi/json-out-without-keywordization})

(t2/deftransforms :model/Measure
  {:definition         transform-measure-definition
   :dimensions         metrics/transform-dimensions
   :dimension_mappings metrics/transform-dimension-mappings})

(doto :model/Measure
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/dependencies))

(defmethod mi/can-read? :model/Measure
  ([instance]
   (let [table (or (:table instance)
                   (measures.db/table (:table_id instance)))]
     (mi/can-read? table)))
  ([_model pk]
   (mi/can-read? (measures.db/measure pk))))

;; Measures can be written by superusers or data analysts with unrestricted view data permissions.
(defmethod mi/can-write? :model/Measure
  ([instance]
   (let [table (or (:table instance)
                   (measures.db/table (:table_id instance)))]
     (and (or api/*is-superuser?*
              (and (api/entitled-data-analyst?)
                   (perms/user-has-permission-for-table?
                    api/*current-user-id*
                    :perms/view-data
                    :unrestricted
                    (:db_id table)
                    (u/the-id table))))
          (remote-sync/can-write? :model/TableUserSettings (:id table)))))
  ([_model pk]
   (mi/can-write? (measures.db/measure pk))))

;; Measures can be created by superusers or data analysts with unrestricted view data permissions.
(defmethod mi/can-create? :model/Measure
  [_model instance]
  (let [table (or (:table instance)
                  (measures.db/table (:table_id instance)))]
    (and (or api/*is-superuser?*
             (and (api/entitled-data-analyst?)
                  (perms/user-has-permission-for-table?
                   api/*current-user-id*
                   :perms/view-data
                   :unrestricted
                   (:db_id table)
                   (u/the-id table))))
         (remote-sync/can-write? :model/TableUserSettings (:id table)))))

(methodical/defmethod t2/batched-hydrate [:model/Measure :can_write]
  "Batched hydration for :can_write on measures, hydrating their tables first."
  [_model k measures]
  (mi/instances-with-hydrated-data
   measures k
   #(u/index-by :id mi/can-write? (t2/hydrate (remove nil? measures) :table))
   :id
   {:default false}))

(t2/define-before-insert :model/Measure
  [{:keys [definition] :as measure}]
  (validate-mbql5-definition definition)
  (when (seq definition)
    (lib/check-measure-overwrite nil definition))
  (cond-> measure
    (seq definition) (m/assoc-some :table_id (lib/primary-source-table-id definition))))

(defenterprise pre-update-check-sandbox-constraints-for-measure
  "Checks additional sandboxing constraints for Metabase Enterprise Edition. The OSS implementation is a no-op."
  metabase-enterprise.sandbox.models.sandbox
  [_ _])

(defenterprise pre-delete-check-sandbox-constraints-for-measure
  "Checks additional sandboxing constraints for Metabase Enterprise Edition. The OSS implementation is a no-op."
  metabase-enterprise.sandbox.models.sandbox
  [_])

(t2/define-before-update :model/Measure [{:keys [id definition] :as measure}]
  ;; additional checks (Enterprise Edition only)
  (pre-update-check-sandbox-constraints-for-measure measure (t2/changes measure))
  ;; throw an Exception if someone tries to update creator_id
  (when (contains? (t2/changes measure) :creator_id)
    (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Measure."))))
  ;; validate and check for cycles if definition is being updated
  (when-let [def-change (:definition (t2/changes measure))]
    (validate-mbql5-definition def-change)
    (lib/check-measure-overwrite id def-change))
  (if (and (contains? (t2/changes measure) :definition)
           (seq definition))
    (m/assoc-some measure
                  :table_id (lib/primary-source-table-id definition))
    measure))

(t2/define-before-delete :model/Measure
  [measure]
  ;; additional checks (Enterprise Edition only)
  (pre-delete-check-sandbox-constraints-for-measure measure)
  measure)

(defmethod mi/perms-objects-set :model/Measure
  [measure read-or-write]
  (let [table (or (:table measure)
                  (measures.db/table-perms-columns (u/the-id (:table_id measure))))]
    (mi/perms-objects-set table read-or-write)))

(defn- normalize-definition-from-db
  "Normalize a measure definition read from the database.
  This handles keyword normalization after JSON round-trip (e.g., string \"mbql/query\" -> keyword :mbql/query)."
  [{:keys [definition] :as measure}]
  (if (seq definition)
    (try
      (assoc measure :definition (-> (lib/normalize ::lib.schema/query definition)
                                     lib-be/normalize-query))
      (catch Throwable e
        (log/errorf "Error normalizing measure definition: %s" (ex-message e))
        measure))
    measure))

(t2/define-after-select :model/Measure
  [measure]
  (normalize-definition-from-db measure))

(mu/defn- definition-description :- [:maybe ::lib.schema.common/non-blank-string]
  "Calculate a nice description of a Measure's definition."
  [{:keys [definition], :as _measure} :- (ms/InstanceOf :model/Measure)]
  (when (some? definition)
    (try
      (lib/describe-top-level-key definition :aggregation)
      (catch Throwable e
        (log/errorf "Error calculating Measure description: %s" (ex-message e))
        nil))))

(methodical/defmethod t2.hydrate/batched-hydrate [:model/Measure :definition_description]
  [_model _key measures]
  (for [measure measures]
    (assoc measure :definition_description (definition-description measure))))

;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serialization/storage-paths :model/Measure [_ entities _ctx]
  (mapv (fn [measure]
          (let [table-path (-> measure :definition serialization/serialized-query-source-table)]
            (into (serialization/storage-path-prefixes table-path)
                  [{:label "measures"} {:label (:name measure) :key (:entity_id measure)}])))
        entities))

(defmethod serialization/spec :model/Measure [_]
  {:schema    ::measures.schema/external-measure
   :copy      [:name :archived :description :entity_id]
   :skip      [:dimensions :dimension_mappings :table_id]
   :transform {:creator_id serialization/user-transform
               :definition (assoc serialization/mbql-transform
                                  :import (fn [store _ queries opts]
                                            (mapv #(cond-> % (seq %) lib-be/normalize-query)
                                                  (serialization/import-mbql store queries opts))))}
   :defaults  {:archived false}})

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search/define-spec "measure"
  {:model :model/Measure
   :attrs {:archived true
           :collection-id false
           :creator-id true
           :database-id :table.db_id
           :created-at true
           :updated-at true
           ;; A measure on a Library table inherits the table's library ranking boost and curated status.
           :root-collection-type {:fn collection/table-root-collection-type}}
   :search-terms [:name :description]
   :render-terms {:table-id                  :table_id
                  :table_description         :table.description
                  :table_name                :table.name
                  :table_display_name        :table.display_name
                  :table_schema              :table.schema
                  ;; The parent table's collection, for [[collection/table-root-collection-type]].
                  ;; Listing these terms also reindexes a measure when its table moves into or out of the Library.
                  :table-collection-id       :table.collection_id
                  :table-is-published        :table.is_published
                  :table-collection-location :collection.location
                  :table-collection-type     :collection.type}
   ;; Only published tables count as library content, matching the table spec's own collection join.
   :joins {:table      [:model/Table [:= :table.id :this.table_id]]
           :collection [:model/Collection
                        [:and
                         [:= :table.is_published true]
                         [:= :collection.id :table.collection_id]]]}})

;;; ------------------------------------------------- Dimension Persistence --------------------------------------------------

(defmethod metrics/save-dimensions! :metadata/measure
  [measure dimensions dimension-mappings]
  (when-let [measure-id (:id measure)]
    (measures.db/set-measure-dimensions! measure-id dimensions dimension-mappings)))

(defmethod serialization/import-dependencies :model/Measure [_ entities]
  (mapv (fn [{:keys [definition]}]
          (serialization/import-mbql-dependencies definition))
        entities))

(defmethod remote-sync/spec :model/Measure
  [_model]
  {:synced-filter-clause measures.db/synced-measures-clause})
