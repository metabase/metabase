(ns metabase.measures.models.measure
  "A Measure is a saved MBQL 'macro', expanding to an `:aggregation` clause. It is tied to a table and contains
   exactly one aggregation expression."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.measure :as lib.schema.measure]
   [metabase.measures.db :as measures.db]
   [metabase.measures.dependencies :as measures.dependencies]
   [metabase.measures.replacement :as measures.replacement]
   [metabase.measures.schema :as measures.schema]
   [metabase.measures.serialization :as measures.serialization]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.replacement.spec :as replacement]
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

(t2/define-before-insert :model/Measure
  [{:keys [definition] :as measure}]
  (check-definition definition)
  (assoc measure :table_id (definition-table-id definition)))

(t2/define-before-update :model/Measure
  [{:keys [definition] :as measure}]
  (let [changes (t2/changes measure)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot change the creator of a Measure.") {:status-code 400})))
    (when (and (contains? changes :table_id) (not (contains? changes :definition)))
      (throw (ex-info (tru "The table of a Measure follows its definition; change the definition instead.") {:status-code 400})))
    (when (contains? changes :definition)
      (check-definition definition))
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

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- check-definitions-of-new-measures
  "Throws unless every Measure that the definition of each of the new Measure `rows` refers to exists."
  [rows]
  (run! #(lib/check-measure-overwrite nil (lib-be/normalize-query (:definition %))) rows))

(mu/defn create-measures! :- [:sequential (ms/InstanceOf :model/Measure)]
  "Insert the Measure `rows` and return the inserted instances, in one transaction and one batch of events. A
  definition that refers to a Measure that does not exist throws."
  [rows :- [:sequential ::measures.schema/measure.create]]
  (if (empty? rows)
    []
    (events/with-batched-events
      (check-definitions-of-new-measures rows)
      (vec (measures.db/insert-measures! rows)))))

(mu/defn create-measure! :- (ms/InstanceOf :model/Measure)
  "Insert the Measure `row` and return the inserted instance, as [[create-measures!]] does."
  [row :- ::measures.schema/measure.create]
  (first (create-measures! [row])))

(defn- check-changed-definitions
  "Throws when the new definition of one of `rows`, updates of the Measures `stored`, differs from the stored one and
  refers to the Measure itself or to a Measure that makes a cycle."
  [rows stored]
  (doseq [{:keys [id definition] :as row} rows
          :when                           (and (contains? row :definition)
                                               (not= (lib-be/normalize-query definition)
                                                     (some-> (get stored id) :definition lib-be/normalize-query)))]
    (lib/check-measure-overwrite id (lib-be/normalize-query definition))))

(mu/defn update-measures! :- [:sequential ::measures.schema/measure.row]
  "Apply the changes in each of `rows`, the id of a Measure and the columns to change, with one statement per distinct
  set of changes, in one transaction and one batch of events. A new definition that makes a cycle of Measures throws.
  Returns `rows`."
  [rows :- [:sequential ::measures.schema/measure.row]]
  (if (empty? rows)
    []
    (events/with-batched-events
      (when (some #(contains? % :definition) rows)
        (check-changed-definitions rows (measures.db/measures-by-id (mapv :id rows))))
      (doseq [[changes group] (group-by #(dissoc % :id) rows)]
        (when (seq changes)
          (measures.db/update-measures! (mapv :id group) changes)))
      (vec rows))))

(mu/defn update-measure!
  "Apply `changes` to the Measure with `id`, as [[update-measures!]] does."
  [id      :- ::lib.schema.id/measure
   changes :- ::measures.schema/measure.update]
  (update-measures! [(assoc changes :id id)])
  nil)

(mu/defn set-measure-dimensions!
  "Set the dimensions and dimension mappings of the Measure with `id`."
  [id                 :- ::lib.schema.id/measure
   dimensions         :- [:maybe sequential?]
   dimension-mappings :- [:maybe [:sequential ::measures.schema/measure.dimension-mapping]]]
  (measures.db/set-measure-dimensions! id dimensions dimension-mappings))

(mu/defn delete-measures!
  "Delete the Measures with `ids`, in one transaction and one batch of events."
  [ids :- [:sequential ::lib.schema.id/measure]]
  (when (seq ids)
    (events/with-batched-events
      (measures.db/delete-measures! ids))))

(def ^:private revision-columns
  "The columns of a Measure that its Revisions track and a revert restores."
  [:name :description :definition :archived :table_id])

(defn- revert-measure!
  "Return the Measure with `id` to the tracked columns of `snapshot`."
  [id _user-id snapshot]
  (update-measure! id (select-keys snapshot revision-columns)))

;;; --------------------------------------------- Dimension persistence ----------------------------------------------

(defmethod metrics/save-dimensions! :metadata/measure
  [measure dimensions dimension-mappings]
  (when-let [measure-id (:id measure)]
    (set-measure-dimensions! measure-id dimensions dimension-mappings)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/Measure
  [_model]
  {:create :event/measure-create
   :update :event/measure-update
   :delete :event/measure-delete})

(defmethod app-db-copy/spec :model/Measure [_model]
  {:skip? false})

(defmethod serialization/spec :model/Measure [_]
  {:schema              ::measures.schema/external-measure
   :copy                [:name :archived :description :entity_id]
   :skip                [:dimensions :dimension_mappings :table_id]
   :transform           {:creator_id serialization/user-transform
                         :definition measures.serialization/definition-transform}
   :defaults            {:archived false}
   :import-dependencies measures.serialization/import-dependencies
   :storage-paths       measures.serialization/storage-paths
   :insert!             create-measures!
   :update!             update-measures!
   :delete!             delete-measures!})

(defmethod remote-sync/spec :model/Measure
  [_model]
  {:synced-items         measures.db/synced-measure-items
   :synced-filter-clause measures.db/synced-measures-clause})

(defmethod revisions/spec :model/Measure [_model]
  {:track        revision-columns
   :skip         [:entity_id :creator_id :dimensions :dimension_mappings]
   :same?        {:definition revisions/same-definition?}
   :revert!      revert-measure!
   :diff-columns [:name :description :definition]})

(defmethod audit/spec :model/Measure [_model]
  {:track          []
   :track-redacted [:archived :creator_id :definition :description :name :table_id]
   :skip           [:dimension_mappings :dimensions :entity_id]})

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

(defmethod dependencies/spec :model/Measure [_model]
  {:type     :measure
   :inlined? true
   :items    measures.db/dependency-measure-items

   :dependencies measures.dependencies/dependencies

   :dependency-columns #{:definition :table_id}
   :output-columns     #{:definition :table_id}})

(defmethod replacement/spec :model/Measure [_model]
  {:upgrade-field-refs measures.replacement/upgrade-field-refs
   :swap-source        measures.replacement/swap-source})

(defmethod eid-translation/spec :model/Measure [_model]
  {:names [:measure]})
