(ns metabase-enterprise.dependencies.findings
  "Every entity whose analysis failed, with its errors and their causes, and the drain that makes the findings current."
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
  "The jobs' batches, in the order work flows between them."
  [task.dependency/run-batch-in-place!
   task.result-metadata/run-batch-in-place!
   task.analysis-finding/run-batch-in-place!])

(def ^:private jobs-enabled?
  [task.dependency/enabled?
   task.result-metadata/enabled?
   task.analysis-finding/enabled?])

(defn- job-disabled-error []
  (ex-info (tru "The analysis cannot run while one of its jobs is disabled by its batch size.")
           {:status-code 503}))

(mu/defn drain-pending! :- :nil
  "Run the jobs until none has work left. Throws a 503 when Metabase is in read-only mode or a job is disabled."
  []
  (when (cloud-migration/read-only-mode)
    (throw (ex-info (tru "The analysis cannot run while Metabase is in read-only mode.")
                    {:status-code 503})))
  (when-not (every? #(%) jobs-enabled?)
    (throw (job-disabled-error)))
  (loop [job 0, idle 0]
    ;; stop only once every job in a row is idle, so neither work a job leaves for a later one nor a write made
    ;; meanwhile is left pending
    (when (< idle (count job-batches))
      (case ((job-batches job))
        :worked   (recur job 0)
        :idle     (recur (rem (inc job) (count job-batches)) (inc idle))
        ;; a batch size can change mid-drain
        :disabled (throw (job-disabled-error))))))

;;; ------------------------------------------- Reading the findings -------------------------------------------

(mr/def ::analyzed-type
  "A type of entity the analysis checks."
  (into [:enum] (sort deps.analysis-finding/analyzable-entities)))

(mr/def ::cause
  "The entity an error is traced to. `entity_id` and `name` are nil once the entity is deleted; `entity_id` is always
  nil for a table."
  [:map {:closed true}
   [:type      ::lib.schema.validate/source-entity-type]
   [:id        ms/PositiveInt]
   [:entity_id [:maybe :string]]
   [:name      [:maybe :string]]])

(mr/def ::error
  [:map {:closed true}
   [:type   ::lib.schema.validate/validate-error-type]
   [:detail [:maybe :string]]
   [:cause  [:maybe ::cause]]])

(mr/def ::failed-entity
  [:map {:closed true}
   [:type          ::analyzed-type]
   [:id            ms/PositiveInt]
   [:entity_id     :string]
   [:name          :string]
   [:collection_id [:maybe ms/PositiveInt]]
   [:errors        [:sequential ::error]]])

(def ^:private cause-columns
  {:table     [:id :name]
   :card      [:id :name :entity_id]
   :transform [:id :name :entity_id]})

(mu/defn- cause-rows :- [:map-of [:tuple ::lib.schema.validate/source-entity-type ms/PositiveInt] :map]
  "The source entities the `rows` name, keyed by `[type id]`; deleted ones are absent."
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

(def ^:private known-error-type?
  (mr/validator ::lib.schema.validate/validate-error-type))

(defn- with-known-error-type
  "`row` with an error type the analysis no longer emits, which a version bump leaves stored until the entity is
  analyzed again, read as an analysis failure that names the stored type."
  [{:keys [error_type error_detail] :as row}]
  (if (known-error-type? error_type)
    row
    (assoc row
           :error_type   :validation-exception-error
           :error_detail (str "Unknown error type " (name error_type) (if error_detail (str ": " error_detail) ".")))))

(mu/defn- errors-by-id :- [:map-of ms/PositiveInt [:sequential ::error]]
  [entity-type :- ::analyzed-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (let [rows   (mapv with-known-error-type (dependencies.db/finding-errors-for-entities entity-type entity-ids))
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

(def ^:private given-up-error
  {:type   :validation-exception-error
   :detail "Could not compute the dependencies of this entity."
   :cause  nil})

(def ^:private unrecorded-error
  {:type   :validation-exception-error
   :detail "No error was recorded for this entity."
   :cause  nil})

(mu/defn- failed-entities-of-type :- [:sequential ::failed-entity]
  [entity-type :- ::analyzed-type]
  (let [rows   (dependencies.db/failed-analysis-entities entity-type)
        errors (errors-by-id entity-type (mapv :id rows))]
    (mapv (fn [{:keys [id given_up] :as row}]
            {:type          entity-type
             :id            id
             :entity_id     (:entity_id row)
             :name          (:name row)
             :collection_id (:collection_id row)
             ;; a given-up entity may have no failed finding, since the analysis skips an entity without current
             ;; dependencies, and a failed finding may have no error rows; every row returned has failed
             :errors        (vec (or (errors id) [(if given_up given-up-error unrecorded-error)]))})
          rows)))

(mu/defn failed-entities :- [:sequential ::failed-entity]
  "Every entity whose stored analysis failed or whose dependencies could not be computed, with its errors, excluding
  archived and Metabase-managed content. Call [[drain-pending!]] first for current results."
  []
  (into [] (mapcat failed-entities-of-type) (sort deps.analysis-finding/analyzable-entities)))
