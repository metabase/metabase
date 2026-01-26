(ns metabase.measures.models.measure
  "A Measure is a saved MBQL 'macro', expanding to an `:aggregation` clause. It is tied to a table and contains
   exactly one aggregation expression."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.measure :as lib.schema.measure]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(methodical/defmethod t2/table-name :model/Measure [_model] :measure)
(methodical/defmethod t2/model-for-automagic-hydration [:default :measure] [_original-model _k] :model/Measure)

(defn- validate-mbql5-definition
  "Validate that a measure definition is in MBQL5 format.
  Throws an exception with 'Invalid measure definition' if the definition is not valid MBQL5."
  [definition]
  (when (seq definition)
    (when-not (= :mbql-version/mbql5 (lib/normalized-mbql-version definition))
      (throw (ex-info (tru "Invalid measure definition: expected MBQL5 format")
                      {:definition definition})))
    (mu/validate-throw ::lib.schema.measure/definition definition)))

(def ^:private transform-measure-definition
  "Transform for measure definitions. Handles JSON serialization/deserialization.
  Validation happens in before-insert and before-update hooks."
  {:in mi/json-in
   :out mi/json-out-with-keywordization})

(t2/deftransforms :model/Measure
  {:definition transform-measure-definition})

(doto :model/Measure
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/can-read? :model/Measure
  ([instance]
   (let [table (:table (t2/hydrate instance :table))]
     (perms/user-has-permission-for-table?
      api/*current-user-id*
      :perms/manage-table-metadata
      :yes
      (:db_id table)
      (u/the-id table))))
  ([model pk]
   (mi/can-read? (t2/select-one model pk))))

;; Measures can be written by superusers, but only if the parent table is editable
;; (not in a remote-synced collection in read-only mode).
(defmethod mi/can-write? :model/Measure
  ([instance]
   (let [table (or (:table instance)
                   (t2/select-one :model/Table :id (:table_id instance)))]
     (and (mi/superuser?)
          (remote-sync/table-editable? table))))
  ([model pk]
   (mi/can-write? (t2/select-one model pk))))

;; Measures can be created by superusers, but only if the parent table is editable
;; (not in a remote-synced collection in read-only mode).
(defmethod mi/can-create? :model/Measure
  [_model instance]
  (let [table (or (:table instance)
                  (t2/select-one :model/Table :id (:table_id instance)))]
    (and (mi/superuser?)
         (remote-sync/table-editable? table))))

(methodical/defmethod t2/batched-hydrate [:model/Measure :can_write]
  "Batched hydration for :can_write on measures. First hydrates :table for all measures,
   then pre-fetches collection is_remote_synced values for those tables, and calls can-write?
   on each measure. This avoids N+1 queries when checking permissions for multiple measures."
  [_model k measures]
  (let [measures-with-tables (t2/hydrate (remove nil? measures) :table)
        ;; Get all unique collection IDs from the hydrated tables
        collection-ids (->> measures-with-tables
                            (keep (comp :collection_id :table))
                            distinct)
        ;; Batch fetch is_remote_synced for all collections
        collection-synced-map (if (seq collection-ids)
                                (into {}
                                      (map (juxt :id :is_remote_synced))
                                      (t2/select :model/Collection :id [:in collection-ids]))
                                {})
        ;; Associate collection info with each measure's table
        measures-with-collection (for [measure measures-with-tables
                                       :let [table (:table measure)
                                             coll-id (:collection_id table)]]
                                   (if (and table coll-id)
                                     (assoc-in measure [:table :collection]
                                               {:id coll-id
                                                :is_remote_synced (get collection-synced-map coll-id false)})
                                     measure))]
    (mi/instances-with-hydrated-data
     measures k
     #(u/index-by :id mi/can-write? measures-with-collection)
     :id
     {:default false})))

(t2/define-before-insert :model/Measure
  [{:keys [definition] :as measure}]
  (validate-mbql5-definition definition)
  (when (seq definition)
    (lib/check-measure-overwrite nil definition))
  measure)

(t2/define-before-update :model/Measure [{:keys [id] :as measure}]
  ;; throw an Exception if someone tries to update creator_id
  (when (contains? (t2/changes measure) :creator_id)
    (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Measure."))))
  ;; validate and check for cycles if definition is being updated
  (when-let [def-change (:definition (t2/changes measure))]
    (validate-mbql5-definition def-change)
    (lib/check-measure-overwrite id def-change))
  measure)

(defmethod mi/perms-objects-set :model/Measure
  [measure read-or-write]
  (let [table (or (:table measure)
                  (t2/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id measure))))]
    (mi/perms-objects-set table read-or-write)))

(defn- normalize-definition-from-db
  "Normalize a measure definition read from the database.
  This handles keyword normalization after JSON round-trip (e.g., string \"mbql/query\" -> keyword :mbql/query)."
  [{:keys [definition] :as measure}]
  (if (seq definition)
    (try
      (assoc measure :definition (lib-be/normalize-query definition))
      (catch Throwable e
        (log/error e "Error normalizing measure definition:" (ex-message e))
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
        (log/error e "Error calculating Measure description:" (ex-message e))
        nil))))

(methodical/defmethod t2.hydrate/batched-hydrate [:model/Measure :definition_description]
  [_model _key measures]
  (for [measure measures]
    (assoc measure :definition_description (definition-description measure))))

;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serdes/hash-fields :model/Measure
  [_measure]
  [:name (serdes/hydrated-hash :table) :created_at])

(defmethod serdes/dependencies "Measure" [{:keys [definition table_id]}]
  (set/union #{(serdes/table->path table_id)}
             (serdes/mbql-deps definition)))

(defmethod serdes/storage-path "Measure" [measure _ctx]
  (let [{:keys [id label]} (-> measure serdes/path last)]
    (-> measure
        :table_id
        serdes/table->path
        serdes/storage-path-prefixes
        (concat ["measures" (serdes/storage-leaf-file-name id label)]))))

(defn- import-measure-definition
  "Import a measure definition from serialization format.
  Converts portable IDs back to numeric IDs, then converts MBQL4 to MBQL5."
  [exported]
  (let [with-ids (serdes/import-mbql exported)]
    (when (seq with-ids)
      (lib-be/normalize-query with-ids))))

(defmethod serdes/make-spec "Measure" [_model-name _opts]
  {:copy [:name :archived :description :entity_id]
   :skip [:dependency_analysis_version]
   :transform {:created_at (serdes/date)
               :table_id (serdes/fk :model/Table)
               :creator_id (serdes/fk :model/User)
               :definition {:export serdes/export-mbql :import import-measure-definition}}})

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search/define-spec "measure"
  {:model :model/Measure
   :attrs {:archived true
           :collection-id false
           :creator-id false
           :database-id :table.db_id
           :created-at false
           :updated-at true}
   :search-terms [:name :description]
   :render-terms {:table-id :table_id
                  :table_description :table.description
                  :table_name :table.name
                  :table_schema :table.schema}
   :joins {:table [:model/Table [:= :table.id :this.table_id]]}})
