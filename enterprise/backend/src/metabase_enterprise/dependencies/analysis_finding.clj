(ns metabase-enterprise.dependencies.analysis-finding
  "Analyzes the entities whose AnalysisFindingStatus a write marked stale, recording what each one's query no longer finds."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding-status :as models.analysis-finding-status]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.dependencies.core :as dependencies]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn analyzed-types :- [:sequential ::deps.dependency-types/dependency-types]
  "The entity types whose specs analyze their entities, in order."
  []
  (->> (dependencies/type->model)
       (keep (fn [[entity-type model]]
               (when (:analysis (dependencies/spec model))
                 entity-type)))
       sort
       vec))

(mu/defn analyze-entity :- [:map {:closed true}
                            [:entity-type ::deps.dependency-types/dependency-types]
                            [:entity-id   ms/PositiveInt]
                            [:analysis    [:map {:closed true}
                                           [:result          :boolean]
                                           [:finding-details [:maybe [:set ::lib.schema.validate/error-with-source]]]]]]
  "Analyze the Toucan entity `entity` with the `:analysis` of its spec, reusing the caller's metadata provider cache
  when it has one, returning its type, id and the finding to record."
  [entity :- [:fn {:error/message "a Toucan instance"} t2/instance?]]
  (lib-be/with-metadata-provider-cache
    (let [model    (t2/model entity)
          analysis (:analysis (dependencies/spec model))
          results  (try (analysis entity)
                        (catch Exception e
                          (dependencies.db/throw-unless-app-db-reachable! e)
                          (log/errorf "Error analyzing entity: %s" (ex-message e))
                          #{(lib/validation-exception-error (.getMessage e))}))]
      {:entity-type (dependencies/model-type model)
       :entity-id   (:id entity)
       :analysis    {:result (empty? results) :finding-details results}})))

(mu/defn record-failed-finding! :- :nil
  "Record `e` as the failed finding of the entity `entity-type` `entity-id`. Logs instead of throwing when that fails."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt
   e           :- (ms/InstanceOfClass Throwable)]
  (try
    (models.analysis-finding/upsert-analysis!
     entity-type entity-id false #{(lib/validation-exception-error (or (ex-message e) (.getName (class e))))})
    (catch Exception record-e
      (log/errorf "Recording the failure of entity %s %s failed: %s" (name entity-type) entity-id (ex-message record-e))))
  nil)

(mu/defn- record-analysis-failure! :- :nil
  "Count a failed analysis of the entity `entity-type` `entity-id`; the job gives up after `dependency-max-failures`."
  [entity-type :- ::dependencies.schema/entity-type
   entity-id   :- ms/PositiveInt]
  (when (models.analysis-finding-status/record-analysis-finding-failure! entity-type entity-id (deps.settings/dependency-max-failures))
    (log/warnf "Giving up on analyzing %s %s until it changes" (name entity-type) entity-id))
  nil)

(mu/defn- remove-deleted-statuses! :- nat-int?
  "Delete the AnalysisFindingStatuses of up to `batch-size` deleted entities of each analyzable type, returning how
  many it deleted."
  [batch-size :- pos-int?]
  (reduce + (for [entity-type (analyzed-types)
                  :let        [ids (dependencies.db/analysis-finding-deleted-entity-ids entity-type batch-size)]]
              (if (seq ids)
                (models.analysis-finding-status/delete-analysis-finding-statuses! entity-type ids)
                0))))

(mu/defn- take-pending-statuses! :- [:map-of ::deps.dependency-types/dependency-types
                                     [:sequential ::dependencies.schema/pending-status]]
  "Up to `batch-size` analyzable entities whose AnalysisFindingStatus counts a write, is missing or is outdated, as
  `{entity-type statuses}`, each with the `stale` count the job clears afterwards."
  [batch-size :- pos-int?]
  (reduce (fn [taken entity-type]
            (let [remaining (- batch-size (reduce + (map count (vals taken))))
                  statuses  (when (pos? remaining)
                              (models.analysis-finding-status/take-pending-analysis-finding-statuses!
                               entity-type remaining models.analysis-finding/*current-analysis-finding-version*
                               models.dependency/current-dependency-analysis-version))]
              (cond-> taken
                (seq statuses) (assoc entity-type statuses))))
          {}
          (analyzed-types)))

(mu/defn- handle-analysis-failure! :- :nil
  "Count the failure `e` to analyze the entity `entity-type` `entity-id`, recording it as its finding, rethrowing an
  Error."
  [entity-type :- ::dependencies.schema/entity-type
   entity-id   :- ms/PositiveInt
   e           :- (ms/InstanceOfClass Throwable)]
  (dependencies.db/throw-unless-app-db-reachable! e)
  (log/errorf "Analyzing %s %s failed: %s" (name entity-type) entity-id (ex-message e))
  (record-failed-finding! entity-type entity-id e)
  (record-analysis-failure! entity-type entity-id)
  (when-not (instance? Exception e)
    (throw e)))

(mu/defn- store-analyses-and-clear! :- :nil
  "Store the findings `analyses` of the entities of `entity-type`, a map of entity id to finding, then clear their
  `stale` counts."
  [entity-type :- ::dependencies.schema/entity-type
   stale       :- [:map-of ms/PositiveInt ms/IntGreaterThanOrEqualToZero]
   analyses    :- [:map-of ms/PositiveInt [:map {:closed true}
                                           [:result          :boolean]
                                           [:finding-details [:maybe
                                                              [:set ::lib.schema.validate/error-with-source]]]]]]
  (t2/with-transaction [_conn]
    (models.analysis-finding/upsert-analyses! entity-type analyses)
    (models.analysis-finding-status/clear-analysis-finding-statuses!
     entity-type
     (into {} (map (fn [id] [id (stale id)])) (keys analyses))
     models.analysis-finding/*current-analysis-finding-version*))
  nil)

(mu/defn analyze-batch! :- nat-int?
  "Analyze up to `batch-size` analyzable entities whose AnalysisFindingStatus counts a write, is missing or is
  outdated, clearing each one's `stale` count unless a write raised it meanwhile, or counting its failure, returning
  how many it took, the findings of each type stored together, or for each entity when that fails."
  [batch-size :- pos-int?]
  ;; The cache spans the select too: reading an entity attaches a `MetadataProvider` to its query
  ;; (see `metabase.lib-be.models.transforms/transform-query`), so selecting outside the cache gives every entity in
  ;; the batch a private one.
  (let [removed (remove-deleted-statuses! batch-size)]
    (lib-be/with-metadata-provider-cache
      (let [taken (take-pending-statuses! batch-size)]
        (doseq [[entity-type statuses] taken
                :let [stale    (into {} (map (juxt :entity_id :stale)) statuses)
                      entities (dependencies.db/readable-entities #(dependencies.db/entities entity-type %)
                                                                  (set (keys stale))
                                                                  (fn [entity-id e]
                                                                    (log/errorf "Reading %s %s failed: %s"
                                                                                (name entity-type) entity-id (ex-message e))
                                                                    (record-failed-finding! entity-type entity-id e)
                                                                    (record-analysis-failure! entity-type entity-id)))
                      analyses (into {}
                                     (task.util/compute-in-parallel
                                      (fn [entity]
                                        (let [analyzed (analyze-entity entity)]
                                          [(:entity-id analyzed) (:analysis analyzed)]))
                                      (fn [entity e]
                                        (handle-analysis-failure! entity-type (:id entity) e))
                                      entities))]
                :when (seq analyses)]
          (try
            (store-analyses-and-clear! entity-type stale analyses)
            (catch Throwable e
              (when-not (instance? Exception e)
                (throw e))
              (doseq [[id analysis] analyses]
                (try
                  (store-analyses-and-clear! entity-type stale {id analysis})
                  (catch Throwable e
                    (handle-analysis-failure! entity-type id e)))))))
        (+ removed (reduce + (map count (vals taken))))))))
