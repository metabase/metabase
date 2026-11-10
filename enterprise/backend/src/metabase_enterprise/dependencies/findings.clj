(ns metabase-enterprise.dependencies.findings
  "The stored analysis findings read as a whole: every entity whose query analysis failed, with its errors and what
  caused each, once the background work that keeps the findings current has run."
  (:require
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.cloud-migration.core :as cloud-migration]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Draining the jobs -------------------------------------------

(def ^:private job-batches
  "The jobs' batches, in the order their work flows: computing dependencies decides which result metadata and findings
  are stale, and the analysis reads result metadata."
  [task.dependency/run-batch-in-place!
   task.result-metadata/run-batch-in-place!
   task.analysis-finding/run-batch-in-place!])

(mu/defn- drain-jobs! :- :nil
  "Run the jobs' batches until none has anything left to do."
  []
  (loop [job 0, idle 0]
    ;; a job that worked may have made any job's entities stale, so the drain is done only once every job in a row
    ;; finds nothing
    (when (< idle (count job-batches))
      (case ((job-batches job))
        :worked   (recur job 0)
        :idle     (recur (rem (inc job) (count job-batches)) (inc idle))
        :busy     (recur job idle)
        :disabled (throw (ex-info (tru "The analysis cannot run while one of its jobs is disabled by its batch size.")
                                  {:status-code 503}))))))

(mu/defn drain-pending! :- :nil
  "Run the dependency, result metadata and analysis jobs in place until none has anything left to do, so that the
  findings reflect every write committed before the call. A write marks what it makes stale in its own transaction, so
  nothing committed is missed; only the jobs' scheduling is deferred. One drain runs at a time across the cluster: a
  caller that finds one running waits for it, then runs its own, which has only the writes since to take. Throws when
  the findings cannot be made current: the app DB is read-only, or a job is disabled."
  []
  (when (cloud-migration/read-only-mode)
    (throw (ex-info (tru "The analysis cannot run while Metabase is in read-only mode.")
                    {:status-code 503})))
  (loop []
    (when (= :busy (task.util/run-locked! ::drain drain-jobs! :busy))
      (recur))))

;;; ------------------------------------------- Reading the findings -------------------------------------------

(mr/def ::analyzed-type
  "A type of entity the analysis checks."
  (into [:enum] (sort deps.analysis-finding/analyzable-entities)))

(mr/def ::cause
  "The entity an error is traced to. `entity_id` is nil for a table, which has none, and `name` is nil when the entity
  no longer exists."
  [:map {:closed true}
   [:type      ::lib.schema.validate/source-entity-type]
   [:id        ms/PositiveInt]
   [:entity_id [:maybe :string]]
   [:name      [:maybe :string]]])

(mr/def ::error
  "One error of a failed analysis."
  [:map {:closed true}
   [:type   ::lib.schema.validate/validate-error-type]
   [:detail [:maybe :string]]
   [:cause  [:maybe ::cause]]])

(mr/def ::failed-entity
  "An entity whose analysis failed, with its errors."
  [:map {:closed true}
   [:type          ::analyzed-type]
   [:id            ms/PositiveInt]
   [:entity_id     :string]
   [:name          :string]
   [:collection_id [:maybe ms/PositiveInt]]
   [:errors        [:sequential ::error]]])

(def ^:private cause-columns
  "The columns a cause is described by, per type; a table has no `entity_id`."
  {:table     [:id :name]
   :card      [:id :name :entity_id]
   :transform [:id :name :entity_id]})

(mu/defn- cause-rows :- [:map-of [:tuple ::lib.schema.validate/source-entity-type ms/PositiveInt] :map]
  "The entities the AnalysisFindingError `rows` name as their source, keyed by type and id, without the ones that no
  longer exist."
  [rows :- [:sequential ::dependencies.schema/analysis-finding-error]]
  (let [refs (into #{}
                   (keep (fn [{:keys [source_entity_type source_entity_id]}]
                           (when (and source_entity_type source_entity_id)
                             [source_entity_type source_entity_id])))
                   rows)]
    (into {}
          (mapcat (fn [[source-type ids]]
                    (for [row (dependencies.db/entities-with-columns source-type (cause-columns source-type) ids)]
                      [[source-type (:id row)] row])))
          (u/group-by first second refs))))

(mu/defn- errors-by-id :- [:map-of ms/PositiveInt [:sequential ::error]]
  "The errors of the entities `entity-type` `entity-ids`, keyed by id, each with its cause."
  [entity-type :- ::analyzed-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (let [rows   (dependencies.db/finding-errors-for-entities entity-type entity-ids)
        causes (cause-rows rows)]
    (u/group-by :analyzed_entity_id
                (fn [{:keys [error_type error_detail source_entity_type source_entity_id]}]
                  {:type   error_type
                   :detail error_detail
                   :cause  (when (and source_entity_type source_entity_id)
                             (let [row (causes [source_entity_type source_entity_id])]
                               {:type      source_entity_type
                                :id        source_entity_id
                                :entity_id (:entity_id row)
                                :name      (:name row)}))})
                rows)))

(mu/defn- failed-entities-of-type :- [:sequential ::failed-entity]
  "The entities of `entity-type` whose analysis failed, with their errors."
  [entity-type :- ::analyzed-type]
  (let [rows   (dependencies.db/failed-analysis-entities entity-type)
        errors (errors-by-id entity-type (mapv :id rows))]
    (mapv (fn [{:keys [id] :as row}]
            {:type          entity-type
             :id            id
             :entity_id     (:entity_id row)
             :name          (:name row)
             :collection_id (:collection_id row)
             :errors        (vec (errors id))})
          rows)))

(mu/defn failed-entities :- [:sequential ::failed-entity]
  "Every analyzed entity whose stored analysis failed, with its errors, by type then id: not archived, and not content
  Metabase manages itself. Call [[drain-pending!]] first for an answer that reflects every committed write."
  []
  (into [] (mapcat failed-entities-of-type) (sort deps.analysis-finding/analyzable-entities)))
