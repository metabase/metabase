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

(mu/defn drain-pending! :- :nil
  "Run the dependency, result metadata and analysis jobs in place until none has anything left to do, so that the
  findings reflect every write committed before the call. A write marks what it makes stale in its own transaction, so
  nothing committed is missed; only the jobs' scheduling is deferred. Throws when the findings cannot be made current:
  the app DB is read-only, or a job is disabled."
  []
  (when (cloud-migration/read-only-mode)
    (throw (ex-info (tru "The analysis cannot run while Metabase is in read-only mode.")
                    {:status-code 503})))
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

;; A transform has no `archived` column, and a segment lives under its table rather than in a collection.
(def ^:private entity-columns
  {:card      {:archived? true,  :collection? true}
   :transform {:archived? false, :collection? true}
   :segment   {:archived? true,  :collection? false}})

(mu/defn- failed-entities-of-type :- [:sequential ::failed-entity]
  "The entities of `entity-type` whose analysis failed, without their errors yet."
  [entity-type :- ::analyzed-type]
  (mapv (fn [row]
          {:type          entity-type
           :id            (:id row)
           :entity_id     (:entity_id row)
           :name          (:name row)
           :collection_id (:collection_id row)
           :errors        []})
        (dependencies.db/failed-analysis-entities entity-type (entity-columns entity-type))))

(def ^:private query-batch-size
  "How many ids one query names: an instance can have more failed entities than a statement takes parameters."
  1000)

(def ^:private cause-columns
  "The columns a cause is described by, per type; a table has no `entity_id`."
  {:table     [:id :name]
   :card      [:id :name :entity_id]
   :transform [:id :name :entity_id]})

(mu/defn- causes :- [:map-of [:tuple ::lib.schema.validate/source-entity-type ms/PositiveInt] ::cause]
  "The causes the AnalysisFindingError `rows` name, keyed by type and id, nameless when the entity no longer exists."
  [rows :- [:sequential ::dependencies.schema/analysis-finding-error]]
  (let [refs  (into #{}
                    (keep (fn [{:keys [source_entity_type source_entity_id]}]
                            (when (and source_entity_type source_entity_id)
                              [source_entity_type source_entity_id])))
                    rows)
        found (into {}
                    (mapcat (fn [[source-type ids]]
                              (for [batch (partition-all query-batch-size ids)
                                    row   (dependencies.db/entities-with-columns
                                           source-type (cause-columns source-type) (vec batch))]
                                [[source-type (:id row)] row])))
                    (u/group-by first second refs))]
    (into {}
          (map (fn [[source-type id :as ref]]
                 (let [row (found ref)]
                   [ref {:type      source-type
                         :id        id
                         :entity_id (:entity_id row)
                         :name      (:name row)}])))
          refs)))

(mu/defn- errors-by-entity :- [:map-of [:tuple ::analyzed-type ms/PositiveInt] [:sequential ::error]]
  "The errors of the failed `entities`, keyed by type and id, each with its cause."
  [entities :- [:sequential ::failed-entity]]
  (let [rows  (into []
                    (mapcat (fn [[entity-type entities]]
                              (mapcat #(dependencies.db/finding-errors-for-entities entity-type (mapv :id %))
                                      (partition-all query-batch-size entities))))
                    (group-by :type entities))
        cause (causes rows)]
    (u/group-by (juxt :analyzed_entity_type :analyzed_entity_id)
                (fn [{:keys [error_type error_detail source_entity_type source_entity_id]}]
                  {:type   error_type
                   :detail error_detail
                   :cause  (when (and source_entity_type source_entity_id)
                             (cause [source_entity_type source_entity_id]))})
                rows)))

(mu/defn failed-entities :- [:sequential ::failed-entity]
  "Every analyzed entity whose stored analysis failed, with its errors, by type then id: not archived, and not content
  Metabase manages itself. Call [[drain-pending!]] first for an answer that reflects every committed write."
  []
  (let [entities (into []
                       (mapcat failed-entities-of-type)
                       (sort deps.analysis-finding/analyzable-entities))
        errors   (errors-by-entity entities)]
    (mapv (fn [{:keys [type id] :as entity}]
            (assoc entity :errors (vec (errors [type id]))))
          entities)))
