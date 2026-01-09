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
  "Validate that an MBQL 5 measure definition has the correct structure."
  [definition]
  (when (seq definition)
    (mu/validate-throw ::lib.schema.measure/definition definition)
    definition))

(defn- normalize-measure-definition
  "Normalize measure definition.
  Accepts:
  - MBQL 5 full queries (passed through)
  - MBQL 4 full queries (from serialization - converted to MBQL 5)
  Empty seqs are normalized to `{}`."
  [definition table-id database-id]
  (if (seq definition)
    (u/prog1 (-> (case (lib/normalized-mbql-version definition)
                   (:mbql-version/mbql5 :mbql-version/legacy)
                   definition
                   ;; default MBQL4 fragment - wrap it in a full query
                   {:database database-id
                    :type :query
                    :query (merge {:source-table table-id} definition)})
                 lib-be/normalize-query)
      (validate-mbql5-definition <>))
    {}))

(def ^:private transform-measure-definition
  "Transform for measure definitions. Only handles JSON serialization/deserialization.
  Normalization and validation happen in before-insert and after-select hooks."
  {:in mi/json-in
   :out mi/json-out-with-keywordization})

(t2/deftransforms :model/Measure
  {:definition transform-measure-definition})

(doto :model/Measure
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

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

(defn- migrated-measure-definition
  [{:keys [definition], table-id :table_id}]
  (let [database-id (t2/select-one-fn :db_id :model/Table :id table-id)]
    (normalize-measure-definition definition table-id database-id)))

(t2/define-before-insert :model/Measure
  [{:keys [definition] :as measure}]
  (let [measure (cond-> measure
                  (some? definition) (assoc :definition (migrated-measure-definition measure)))]
    (when (seq (:definition measure))
      (lib/check-measure-overwrite nil (:definition measure)))
    measure))

(t2/define-before-update :model/Measure [{:keys [id] :as measure}]
  ;; throw an Exception if someone tries to update creator_id
  (when (contains? (t2/changes measure) :creator_id)
    (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Measure."))))
  ;; check for cycles if definition is being updated
  (when-let [def-change (:definition (t2/changes measure))]
    (let [normalized-def (migrated-measure-definition (assoc measure :definition def-change))]
      (lib/check-measure-overwrite id normalized-def)))
  measure)

(defmethod mi/perms-objects-set :model/Measure
  [measure read-or-write]
  (let [table (or (:table measure)
                  (t2/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id measure))))]
    (mi/perms-objects-set table read-or-write)))

(defn- maybe-migrated-measure-definition
  [measure]
  (try
    (migrated-measure-definition measure)
    (catch Throwable e
      (log/error e "Error upgrading measure definition:" (ex-message e))
      nil)))

(t2/define-after-select :model/Measure
  [{:keys [definition] :as measure}]
  (cond-> measure
    (some? definition) (assoc :definition (maybe-migrated-measure-definition measure))))

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

(defmethod serdes/make-spec "Measure" [_model-name _opts]
  {:copy [:name :archived :description :entity_id]
   :skip [:dependency_analysis_version]
   :transform {:created_at (serdes/date)
               :table_id (serdes/fk :model/Table)
               :creator_id (serdes/fk :model/User)
               :definition {:export serdes/export-mbql :import serdes/import-mbql}}})

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
