(ns metabase.measures.models.measure
  "A Measure is a saved MBQL 'macro', expanding to an `:aggregation` clause. It is tied to a table and contains
   exactly one aggregation expression."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
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
   [metabase.util.malli.registry :as mr]
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
  (derive :hook/entity-id))

(defn- definition-table-id
  "The id of the Table `definition`, a full query, is built on, read without the app DB."
  [definition]
  (:source-table (lib-be/query-first-stage definition)))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-insert :model/Measure
  [{:keys [definition] :as measure}]
  (assoc measure :table_id (definition-table-id definition)))

(t2/define-before-update :model/Measure
  [{:keys [definition] :as measure}]
  (let [changes (t2/changes measure)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot change the creator of a Measure.") {:status-code 400})))
    (when (and (contains? changes :table_id) (not (contains? changes :definition)))
      (throw (ex-info (tru "The table of a Measure follows its definition; change the definition instead.") {:status-code 400})))
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
  "Insert the Measure `rows` and return the inserted instances, in one transaction, publishing their create event. A
  definition that refers to a Measure that does not exist throws."
  [rows :- [:sequential ::measures.schema/measure.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (check-definitions-of-new-measures rows)
      (let [measures (vec (measures.db/insert-measures! rows))]
        (events/publish-event! :event/measure-create (events/create-event measures))
        measures))))

(defn- check-changed-definition
  "Throws when the new definition in `changes` of one of the Measures with `ids`, `stored` as they are, differs from the
  stored one and refers to the Measure itself or to a Measure that makes a cycle."
  [ids changes stored]
  (when (contains? changes :definition)
    (let [definition (lib-be/normalize-query (:definition changes))]
      (doseq [id    ids
              :when (not= definition (some-> (get stored id) :definition lib-be/normalize-query))]
        (lib/check-measure-overwrite id definition)))))

(defn- updated-measure
  "The Measure `stored` as the update `changes` leaves it, with the table that the hook derives from a new definition."
  [stored changes]
  (cond-> (merge stored changes)
    (contains? changes :definition) (assoc :definition (lib-be/normalize-query (:definition changes))
                                           :table_id   (definition-table-id (:definition changes)))))

(mr/def ::write-opts
  "The options of the update of Measures: `:writer`, who writes when it matters, and the context of the events."
  [:maybe
   [:map {:closed true}
    [:writer  {:optional true} [:enum :import :replacement :revert]]
    [:context {:optional true} [:maybe :metabase.events.schema/context]]]])

(defn- check-measure-updates
  "Throw a 400 unless every one of `rows`, updates of the `stored` Measures, satisfies these rules:

  - a new definition does not refer to the Measure itself or make a cycle of Measures"
  [stored rows]
  (doseq [{:keys [id] :as row} rows]
    (check-changed-definition [id] (dissoc row :id) stored)))

(defn- assoc-measure-tables
  "`rows`, updates of Measures, each with the table its new definition gives, computed once for each distinct definition."
  [rows]
  (let [table-ids (into {} (map (fn [definition] [definition (definition-table-id definition)]))
                        (distinct (keep :definition rows)))]
    (mapv #(cond-> % (contains? % :definition) (assoc :table_id (get table-ids (:definition %)))) rows)))

(defn- write-measure-updates!
  "Writes `rows`, updates of the `stored` Measures, each with the table its new definition gives, and returns what the event
  needs, the changes of each row and the Measures as they are after the write."
  [stored rows]
  (measures.db/update-measures! (assoc-measure-tables rows))
  {:stored  stored
   :rows    rows
   :objects (into {} (map (fn [{:keys [id] :as row}] [id (updated-measure (stored id) (dissoc row :id))])) rows)})

(defn- update-measure-batch!
  "Checks and writes the Measures of `batch`, up to one partition of the call, and returns what the event needs."
  [batch]
  (let [stored (measures.db/measures-by-ids (mapv :id batch))
        rows   (filterv #(contains? stored (:id %)) batch)]
    (check-measure-updates stored rows)
    (write-measure-updates! stored rows)))

(defn- publish-measure-updates!
  "Publishes the update event of the Measures that `batches`, what [[update-measure-batch!]] returned, wrote."
  [batches opts]
  (when (some (comp seq :rows) batches)
    (events/publish-event! :event/measure-update
                           (events/update-event (into {} (map :stored) batches)
                                                (into [] (mapcat :rows) batches)
                                                (assoc opts :objects (into {} (map :objects) batches))))))

(mu/defn update-measures! :- [:sequential ::measures.schema/measure.update]
  "Apply `updates`, each the `:id` of a Measure with the columns to give it, in one transaction, publishing their update
  event with the `:writer` and `:context` of `opts`. Returns `updates`."
  ([updates :- [:sequential ::measures.schema/measure.update]]
   (update-measures! updates nil))
  ([updates :- [:sequential ::measures.schema/measure.update]
    opts    :- ::write-opts]
   (t2/with-transaction [_conn]
     (let [batches (mapv update-measure-batch! (partition-all app-db/update-partition-size updates))]
       (publish-measure-updates! batches opts)))
   (vec updates)))

(mu/defn set-measure-dimensions!
  "Set the dimensions and dimension mappings of the Measure with `id`, publishing its update event."
  [id                 :- ::lib.schema.id/measure
   dimensions         :- [:maybe [:sequential ::measures.schema/measure.dimension]]
   dimension-mappings :- [:maybe [:sequential ::measures.schema/measure.dimension-mapping]]]
  (t2/with-transaction [_conn]
    (when-let [previous (measures.db/measure id)]
      (measures.db/set-measure-dimensions! id dimensions dimension-mappings)
      (events/publish-event! :event/measure-update
                             (events/update-event {id previous}
                                                  [{:id id :dimensions dimensions :dimension_mappings dimension-mappings}])))))

(mu/defn delete-measures! :- :nil
  "Delete the Measures with `ids` in one transaction, publishing their delete event right before the first statement."
  [ids :- [:sequential ::lib.schema.id/measure]]
  (t2/with-transaction [_conn]
    (let [batches (partition-all app-db/delete-partition-size ids)]
      (when (seq batches)
        (events/publish-event! :event/measure-delete
                               (events/delete-event (into [] (mapcat #(vals (measures.db/measures-by-ids (vec %)))) batches))))
      (run! #(measures.db/delete-measures! (vec %)) batches)))
  nil)

(def ^:private revision-columns
  "The columns of a Measure that its Revisions track and a revert restores."
  [:name :description :definition :archived :table_id])

(defn- revert-measure!
  "Return the Measure with `id` to the `snapshot` of a Measure that a Revision recorded."
  [id _user-id snapshot]
  (update-measures! [(assoc snapshot :id id)] {:writer :revert}))

;;; --------------------------------------------- Dimension persistence ----------------------------------------------

(defmethod metrics/save-dimensions! :metadata/measure
  [measure dimensions dimension-mappings]
  (when-let [measure-id (:id measure)]
    (set-measure-dimensions! measure-id dimensions dimension-mappings)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

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
   :update!             #(update-measures! % {:writer :import})
   :delete!             delete-measures!})

(defmethod remote-sync/spec :model/Measure
  [_model]
  {:synced-items         measures.db/synced-measure-items
   :synced-filter-clause measures.db/synced-measures-clause})

(defmethod revisions/spec :model/Measure [_model]
  {:track        revision-columns
   :skip         [:entity_id :creator_id :dimensions :dimension_mappings]
   :schema       ::measures.schema/measure.revision
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
   :swap-source        measures.replacement/swap-source
   :update!            #(update-measures! % {:writer :replacement})})

(defmethod eid-translation/spec :model/Measure [_model]
  {:names [:measure]})
