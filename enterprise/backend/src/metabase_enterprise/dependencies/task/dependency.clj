(ns metabase-enterprise.dependencies.task.dependency
  "The job that computes the dependencies of the entities whose dependency_status counts a write, records an older
  analysis_version or is missing, clearing each count afterwards unless a write raised it meanwhile."
  (:require
   [clojurewerkz.quartzite.scheduler :as qs]
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding-status :as models.analysis-finding-status]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as models.dependency-status]
   [metabase-enterprise.dependencies.models.result-metadata-status :as models.result-metadata-status]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.lib-be.core :as lib-be]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private Entity
  "An entity whose dependencies the job computes, as the app DB holds it."
  [:fn {:error/message "a Toucan entity"} t2/instance?])

(mu/defn- drop-stale-dependents!
  "Drop the edges to the `entities` of `entity-type` from their dependents that its spec's `:after-dependencies` says
  no longer hold, with one read and one delete."
  [entity-type :- ::deps.dependency-types/dependency-types
   entities    :- [:sequential Entity]]
  (when-let [after-dependencies (deps.calculation/after-dependencies entity-type)]
    (let [edges      (dependencies.db/dependencies-on-entities entity-type (mapv :id entities))
          edge-ids   (u/index-by (juxt :from_entity_type :from_entity_id :to_entity_id) :id edges)
          dependents (group-by :to_entity_id edges)
          drop-ids   (vec (for [entity entities
                                :let [dependent-ids (u/group-by :from_entity_type :from_entity_id conj #{}
                                                                (get dependents (:id entity)))]
                                [dependent-type ids] (after-dependencies entity dependent-ids)
                                id ids
                                :let [edge-id (edge-ids [dependent-type id (:id entity)])]
                                :when edge-id]
                            edge-id))]
      (when (seq drop-ids)
        (dependencies.db/delete-dependencies! drop-ids)))))

;;; ------------------------------ Job orchestration ------------------------------

(mu/defn- hydrated-entities :- [:sequential Entity]
  "The entities of `entity-type` with `entity-ids`, hydrated by their spec for computing their dependencies."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-ids  :- [:set ms/PositiveInt]]
  (deps.calculation/hydrate-entities entity-type (dependencies.db/entities entity-type entity-ids)))

(mu/defn- store-dependencies! :- :any
  "Store the dependencies of the entities hydrated by [[hydrated-entities]], the pairs `entities+deps` of an entity and
  its dependencies, marking an entity with a new upstream stale for its result metadata and analysis, or for a snippet
  the analysis of what expands it, which an upstream change made before the edge existed never marked."
  [entity-type   :- ::deps.dependency-types/dependency-types
   entities+deps :- [:sequential [:tuple Entity :map]]]
  (let [id->deps (into {} (map (fn [[entity deps]] [(:id entity) deps])) entities+deps)]
    (t2/with-transaction [_]
      (let [new-ids (models.dependency/entities-with-new-dependencies entity-type id->deps)
            own     {entity-type new-ids}]
        (when (seq new-ids)
          (when (= :card entity-type)
            (models.result-metadata-status/mark-result-metadata-statuses-stale! own))
          (when (some #{entity-type} (deps.analysis-finding/analyzed-types))
            (models.analysis-finding-status/mark-analysis-finding-statuses-stale! own))
          (when (= :snippet entity-type)
            (let [graph (models.dependency/graph-dependents)]
              (models.analysis-finding-status/mark-analysis-finding-statuses-stale!
               (reduce (fn [acc entity]
                         (merge-with into acc (models.dependency/transitive-dependents graph {:snippet [entity]})))
                       {}
                       (filter (comp new-ids :id) (map first entities+deps))))))))
      (models.dependency/replace-dependencies-for-entities! entity-type id->deps)
      (drop-stale-dependents! entity-type (mapv first entities+deps)))))

(mu/defn- remove-deleted-entity-batch! :- ms/IntGreaterThanOrEqualToZero
  "Drop the dependencies and status of up to `batch-size` deleted entities of `entity-type`, returning how many were
  removed."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (let [entity-ids (dependencies.db/dependency-deleted-entity-ids entity-type batch-size)]
    (when (seq entity-ids)
      (t2/with-transaction [_]
        (models.dependency/delete-dependencies-for-entities! entity-type entity-ids)
        (models.dependency-status/delete-dependency-statuses! entity-type entity-ids)))
    (count entity-ids)))

(mu/defn- record-failure! :- :nil
  "Count a failure `e` to compute the dependencies of `entity-type` `entity-id`. The analysis only runs on current
  dependencies, so an analyzable entity the job gives up on gets `e` as its finding, and is marked stale so the
  analysis replaces that finding once its dependencies compute again."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt
   e           :- (ms/InstanceOfClass Throwable)]
  (log/errorf "Computing the dependencies of %s %s failed: %s" (name entity-type) entity-id (ex-message e))
  (when (models.dependency-status/record-dependency-failure! entity-type entity-id (deps.settings/dependency-max-failures))
    (log/warnf "Giving up on the dependencies of %s %s until it changes" (name entity-type) entity-id)
    (when (some #{entity-type} (deps.analysis-finding/analyzed-types))
      (models.analysis-finding-status/mark-analysis-finding-statuses-stale! {entity-type #{entity-id}})
      (deps.analysis-finding/record-failed-finding! entity-type entity-id e)))
  nil)

(mu/defn- handle-failure! :- :nil
  "Count the failure `e` to compute the dependencies of the entity `entity-type` `entity-id`, rethrowing an Error."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt
   e           :- (ms/InstanceOfClass Throwable)]
  (dependencies.db/throw-unless-app-db-reachable! e)
  (record-failure! entity-type entity-id e)
  (when-not (instance? Exception e) ;; re-throw Errors
    (throw e)))

(mu/defn- store-and-clear! :- :any
  "Store the dependencies `entities+deps`, then clear the `stale` count of their entities."
  [entity-type   :- ::deps.dependency-types/dependency-types
   stale         :- [:map-of ms/PositiveInt ms/IntGreaterThanOrEqualToZero]
   entities+deps :- [:sequential [:tuple Entity :map]]]
  (store-dependencies! entity-type entities+deps)
  (models.dependency-status/clear-statuses! entity-type
                                            (into {} (map (fn [[entity _]] [(:id entity) (stale (:id entity))])) entities+deps)))

(mu/defn- update-entity-batch! :- ms/IntGreaterThanOrEqualToZero
  "Compute the dependencies of up to `batch-size` pending entities of `entity-type`, clearing each one's `stale` count
  unless a write raised it meanwhile, or counting its failure, returning how many it took. The dependencies are
  stored together, or for each entity when that fails."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (lib-be/with-metadata-provider-cache
    (let [type-name (name entity-type)
          statuses  (models.dependency-status/take-pending-statuses! entity-type batch-size)
          stale     (into {} (map (juxt :entity_id :stale)) statuses)]
      (when (seq statuses)
        (log/debugf "Processing a batch of %s %s(s)..." (count statuses) type-name))
      (let [computed (into []
                           (keep (fn [entity]
                                   (try
                                     (log/debug "Computing dependencies for" type-name (:id entity))
                                     [entity (deps.calculation/calculate-deps entity-type entity)]
                                     (catch Throwable e
                                       (handle-failure! entity-type (:id entity) e)
                                       nil))))
                           (when (seq statuses)
                             (dependencies.db/readable-entities #(hydrated-entities entity-type %)
                                                                (set (keys stale))
                                                                #(record-failure! entity-type %1 %2))))]
        (when (seq computed)
          (try
            (store-and-clear! entity-type stale computed)
            (catch Throwable e
              (when-not (instance? Exception e)
                (throw e))
              (doseq [pair computed]
                (try
                  (store-and-clear! entity-type stale [pair])
                  (catch Throwable e
                    (handle-failure! entity-type (:id (first pair)) e))))))))
      (count statuses))))

(mu/defn- update-dependencies! :- [:maybe :boolean]
  "Update the dependencies of up to a batch of entities, triggering the jobs that read them, and return whether the
  batch took any."
  []
  (when (premium-features/has-feature? :dependencies)
    (let [batch-size (deps.settings/dependency-backfill-batch-size)
          remaining  (reduce (fn [remaining entity-type]
                               (if (< remaining 1)
                                 (reduced 0)
                                 (let [removed   (remove-deleted-entity-batch! entity-type remaining)
                                       processed (if (< removed remaining)
                                                   (update-entity-batch! entity-type (- remaining removed))
                                                   0)]
                                   (when (pos? processed)
                                     (log/debug "Updated" processed "entities."))
                                   (- remaining removed processed))))
                             batch-size
                             (deps.calculation/computed-types))]
      (when (< remaining batch-size)
        (task.analysis-finding/trigger-analysis-finding-job!)
        (task.result-metadata/trigger-result-metadata-job!)
        true))))

(declare ^:private job)

(mu/defn- run-batch! :- [:maybe ms/PositiveInt]
  "Process a batch, returning when to run again: a second from now when it took any, or nil."
  []
  (when (update-dependencies!)
    1))

(mu/defn- log-job-start :- :nil
  "Log the start of the job running in `ctx`, with how many triggers it has."
  [^JobExecutionContext ctx :- (ms/InstanceOfClass JobExecutionContext)]
  (let [scheduler (.getScheduler ctx)
        job-key (.getKey (.getJobDetail ctx))
        job-class (.getSimpleName (.getJobClass (.getJobDetail ctx)))
        active-triggers-count (try (count (qs/get-triggers-of-job scheduler job-key)) (catch Exception _))]
    (log/debugf "Executing %s job. %s total triggers active." job-class active-triggers-count)))

(task/defjob UpdateDependencies
  "Update the dependency table."
  {:saved-class "metabase_enterprise.dependencies.task.backfill.BackfillDependencies"
   :concurrent? false}
  [ctx]
  (let [ctx ^JobExecutionContext ctx]
    (log-job-start ctx)
    (task.util/run-and-reschedule! (.getScheduler ctx) job)))

(def ^:private job
  {:job-type         UpdateDependencies
   :job-key          "metabase.task.dependency-backfill.job"
   :trigger-key      "metabase.task.dependency-backfill.trigger"
   :job-name         "Update Dependencies"
   :batch-size       deps.settings/dependency-backfill-batch-size
   :delay-minutes    deps.settings/dependency-backfill-delay-minutes
   :variance-minutes deps.settings/dependency-backfill-variance-minutes
   :run-batch!       #'run-batch!})

(mu/defn run-batch-in-place! :- ::task.util/batch-outcome
  "Run a batch of the UpdateDependencies job now rather than on its schedule."
  []
  (task.util/run-batch-in-place! job))

(mu/defn enabled? :- :boolean
  "Whether the UpdateDependencies job runs."
  []
  (task.util/enabled? job))

(mu/defn trigger-dependency-job! :- :any
  "Trigger the UpdateDependencies job, unless a MB_DEPENDENCY_BACKFILL_BATCH_SIZE that isn't positive
  disables it."
  []
  (task.util/trigger-run! job))

(defmethod task/init! ::UpdateDependencies [_]
  (task.util/init-job! job))
