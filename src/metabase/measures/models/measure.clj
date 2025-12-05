(ns metabase.measures.models.measure
  "A Measure is a saved MBQL 'macro', expanding to a single `:aggregation` subclause.

  It is invoked (if that's the word) by a `:measure` clause in the aggregations list of an MBQL query.
  The `expand-macros` QP middleware is responsible for expanding measure references with their definitions."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.measures.schema :as measures.schema]
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

;; TODO: (bshepherdson 2025-12-01) We can probably unify a bunch of this logic between segments and measures.
;; They're both freestanding fragments of MBQL modeled in a similar way. I don't think the duplication is terrible
;; with only two, but if a further such entity comes along (expressions, dimensions?) then we should definitely factor
;; out the common bits.
(defn- validate-mbql5-definition
  "Validate that an MBQL 5 measure definition has the correct structure."
  [definition]
  (when (seq definition)
    (mu/validate-throw ::measures.schema/measure definition)
    definition))

(defn- normalize-measure-definition
  "Normalize measure definition.
  Accepts:
  - MBQL 5 full queries (passed through)
  - MBQL 4 full queries (from serialization - converted to MBQL 5)
  Empty seqs are normalized to `{}`."
  [definition]
  (if (seq definition)
    (u/prog1 (lib-be/normalize-query definition)
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

(t2/define-before-update :model/Measure [measure]
  ;; throw an Exception if someone tries to update creator_id
  (when (contains? (t2/changes measure) :creator_id)
    (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Measure."))))
  measure)

(t2/define-before-insert :model/Measure
  [{:keys [definition] :as segment}]
  (cond-> segment
    (some? definition) (update :definition normalize-measure-definition)))

(defmethod mi/perms-objects-set :model/Measure
  [measure read-or-write]
  (let [table (or (:table measure)
                  (t2/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id measure))))]
    (mi/perms-objects-set table read-or-write)))

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
   :skip []
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
           :created-at true
           :updated-at true}
   :search-terms [:name :description]
   :render-terms {:table-id :table_id
                  :table_description :table.description
                  :table_name :table.name
                  :table_schema :table.schema}
   :joins {:table [:model/Table [:= :table.id :this.table_id]]}})
