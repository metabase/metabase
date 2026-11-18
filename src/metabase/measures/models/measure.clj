(ns metabase.measures.models.measure
  "A Measure is a saved MBQL 'macro', expanding to an `:aggregation` clause. It is tied to a table and contains
   exactly one aggregation expression."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.measure :as lib.schema.measure]
   [metabase.measures.db :as measures.db]
   [metabase.measures.schema :as measures.schema]
   [metabase.measures.serialization :as measures.serialization]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
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

(t2/deftransforms :model/Measure
  {:definition         lib-be/transform-query
   :dimensions         metrics/transform-dimensions
   :dimension_mappings metrics/transform-dimension-mappings})

(doto :model/Measure
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod eid-translation/spec :model/Measure [_model]
  {:names [:measure]})

(defmethod events/spec :model/Measure
  [_model]
  {:create :event/measure-create
   :update :event/measure-update
   :delete :event/measure-delete})

(defmethod revisions/spec :model/Measure [_model]
  {:track        [:name :description :definition :archived :table_id]
   :skip         [:entity_id :creator_id :dimensions :dimension_mappings]
   :same?        {:definition revisions/same-definition?}
   :diff-columns [:name :description :definition]})

(defn- definition-table-id
  "The id of the Table `definition`, a full query, is built on."
  [definition]
  (lib/primary-source-table-id (lib-be/normalize-query definition)))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-definition
  "Throws unless `definition` is a full query that fits a Measure."
  [definition]
  (when-not (and (seq definition)
                 (#{:mbql-version/mbql5 :mbql-version/legacy} (lib/normalized-mbql-version definition)))
    (throw (ex-info (tru "Measure definition must be a full query with a source table.") {:status-code 400})))
  (mu/validate-throw ::lib.schema.measure/definition (lib-be/normalize-query definition)))

(defn- check-referenced-measures-exist
  "Throws unless every Measure that `definition`, a new Measure's, refers to exists."
  [definition]
  (lib/check-measure-overwrite nil (lib-be/normalize-query definition)))

(t2/define-before-insert :model/Measure
  [{:keys [definition] :as measure}]
  (check-definition definition)
  (check-referenced-measures-exist definition)
  (assoc measure :table_id (definition-table-id definition)))

(t2/define-before-update :model/Measure
  [{:keys [id definition] :as measure}]
  (let [changes (t2/changes measure)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot change the creator of a Measure.") {:status-code 400})))
    (when (and (contains? changes :table_id) (not (contains? changes :definition)))
      (throw (ex-info (tru "The table of a Measure follows its definition; change the definition instead.") {:status-code 400})))
    (when (contains? changes :definition)
      (check-definition definition)
      (lib/check-measure-overwrite id (lib-be/normalize-query definition)))
    (cond-> measure
      (contains? changes :definition) (assoc :table_id (definition-table-id definition)))))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Measure :can_read]
  "Whether the current user can read each of `measures`, which they can when they read its Table, the Tables answered
  together."
  [_model _k measures]
  (collection/hydrate-table-content-can-read measures))

(methodical/defmethod t2/batched-hydrate [:model/Measure :can_write]
  "Whether the current user can write each of `measures`, which they can when they write Measures of its Table."
  [_model _k measures]
  (collection/hydrate-table-content-can-write measures))

(defn- definition-writable?
  "Whether the current user can write Measures of the Table `definition` is built on."
  [definition]
  (let [table (some-> definition not-empty definition-table-id measures.db/table)]
    (boolean (and table (seq (collection/writable-table-ids [table]))))))

(defmethod mi/can-create? :model/Measure
  [_model {:keys [definition]}]
  (definition-writable? definition))

(defenterprise sandboxes-allow-measure-update?
  "Whether sandboxing lets the current user apply `changes` to `measure`, which OSS always does."
  metabase-enterprise.sandbox.models.sandbox
  [_measure _changes]
  true)

(defmethod mi/can-update? :model/Measure
  [measure changes]
  (and (mi/can-write? measure)
       (or (not (contains? changes :definition))
           (definition-writable? (:definition changes)))
       (sandboxes-allow-measure-update? measure changes)))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

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

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serialization/spec :model/Measure [_]
  {:schema              ::measures.schema/external-measure
   :copy                [:name :archived :description :entity_id]
   :skip                [:dimensions :dimension_mappings :table_id]
   :transform           {:creator_id serialization/user-transform
                         :definition measures.serialization/definition-transform}
   :defaults            {:archived false}
   :import-dependencies measures.serialization/import-dependencies
   :storage-paths       measures.serialization/storage-paths})

;;; -------------------------------------------------- Remote sync ---------------------------------------------------

(defmethod remote-sync/spec :model/Measure
  [_model]
  {:synced-items         measures.db/synced-measure-items
   :synced-filter-clause measures.db/synced-measures-clause})

;;; ----------------------------------------------------- Search -----------------------------------------------------

(defmethod search/spec :model/Measure
  [_model]
  {"measure"
   {:attrs {:archived true
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
                          [:= :collection.id :table.collection_id]]]}}})

;;; --------------------------------------------- Dimension persistence ----------------------------------------------

(defmethod metrics/save-dimensions! :metadata/measure
  [measure dimensions dimension-mappings]
  (when-let [measure-id (:id measure)]
    (measures.db/set-measure-dimensions! measure-id dimensions dimension-mappings)))
