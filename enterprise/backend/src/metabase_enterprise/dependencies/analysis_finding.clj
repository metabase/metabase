(ns metabase-enterprise.dependencies.analysis-finding
  "Analyzes the entities whose AnalysisFindingStatus a write marked stale, recording what each one's query no longer finds."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
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

(def ^:private Analysis
  "What analyzing an entity found: whether it passed, and its errors."
  [:map {:closed true}
   [:result          :boolean]
   [:finding-details [:maybe [:set [:ref ::lib.schema.validate/error-with-source]]]]])

(mu/defn- analysis :- Analysis
  "Analyze the Toucan entity `entity`, without recording anything, reusing the caller's metadata provider cache when it
  has one."
  [entity :- [:fn {:error/message "a Toucan instance"} t2/instance?]]
  (lib-be/with-metadata-provider-cache
    (let [analysis (:analysis (dependencies/spec (t2/model entity)))
          results  (try (analysis entity)
                        (catch Exception e
                          (dependencies.db/throw-unless-app-db-reachable! e)
                          (log/errorf "Error analyzing entity: %s" (ex-message e))
                          #{(lib/validation-exception-error (.getMessage e))}))]
      {:result (empty? results) :finding-details results})))

(mu/defn upsert-analysis!
  "Analyze the Toucan entity `entity` with the `:analysis` of its spec and insert or replace its AnalysisFinding,
  reusing the caller's metadata provider cache when it has one."
  [entity :- [:fn {:error/message "a Toucan instance"} t2/instance?]]
  (let [{:keys [result finding-details]} (analysis entity)]
    (models.analysis-finding/upsert-analysis!
     (dependencies/model-type (t2/model entity)) (:id entity) result finding-details)))

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
  (when (dependencies.db/record-analysis-finding-failure! entity-type entity-id (deps.settings/dependency-max-failures))
    (log/warnf "Giving up on analyzing %s %s until it changes" (name entity-type) entity-id))
  nil)

(mu/defn- record-failure! :- :nil
  "Record that analyzing or writing the entity `entity-type` `entity-id` threw `e`, as its failed finding and in its
  failure count."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt
   e           :- (ms/InstanceOfClass Throwable)]
  (log/errorf "Analyzing %s %s failed: %s" (name entity-type) entity-id (ex-message e))
  (record-failed-finding! entity-type entity-id e)
  (record-analysis-failure! entity-type entity-id))

(mu/defn- write-analyses!
  "Record the `outcomes` of analyzing entities of `entity-type`, and clear each one's status unless `stale-by-id`'s count
  changed meanwhile, in one transaction, or entity by entity when that fails, so one bad row fails only its entity."
  [entity-type :- ::deps.dependency-types/dependency-types
   stale-by-id :- [:map-of ms/PositiveInt ms/IntGreaterThanOrEqualToZero]
   outcomes    :- [:sequential [:map {:closed true}
                                [:entity   [:fn {:error/message "a Toucan instance"} t2/instance?]]
                                [:analysis Analysis]]]]
  (letfn [(write! [outcomes]
            (t2/with-transaction [_]
              (models.analysis-finding/upsert-analyses!
               entity-type
               (mapv (fn [{:keys [entity analysis]}] (assoc analysis :entity-id (:id entity))) outcomes))
              (dependencies.db/clear-analysis-finding-statuses!
               entity-type (select-keys stale-by-id (map (comp :id :entity) outcomes))
               models.analysis-finding/*current-analysis-finding-version*)))]
    (when (seq outcomes)
      (task.util/write-all-or-each! write! #(record-failure! entity-type (:id (:entity %1)) %2) outcomes))))

(mu/defn- remove-deleted-statuses! :- nat-int?
  "Delete the AnalysisFindingStatuses of up to `batch-size` deleted entities of each analyzable type, returning how
  many it deleted."
  [batch-size :- pos-int?]
  (reduce + (for [entity-type (analyzed-types)
                  :let        [ids (dependencies.db/analysis-finding-deleted-entity-ids entity-type batch-size)]]
              (if (seq ids)
                (dependencies.db/delete-analysis-finding-statuses! entity-type ids)
                0))))

(mu/defn- take-pending-statuses! :- [:map-of ::deps.dependency-types/dependency-types
                                     [:sequential ::dependencies.schema/pending-status]]
  "Up to `batch-size` analyzable entities whose AnalysisFindingStatus counts a write, is missing or is outdated, as
  `{entity-type statuses}`, each with the `stale` count the job clears afterwards; with `reported-only?`, only the ones
  the findings report lists."
  [batch-size :- pos-int?
   opts       :- [:map {:closed true} [:reported-only? {:optional true} :boolean]]]
  (reduce (fn [taken entity-type]
            (let [remaining (- batch-size (reduce + (map count (vals taken))))
                  statuses  (when (pos? remaining)
                              (dependencies.db/take-pending-analysis-finding-statuses!
                               entity-type remaining models.analysis-finding/*current-analysis-finding-version*
                               models.dependency/current-dependency-analysis-version opts))]
              (cond-> taken
                (seq statuses) (assoc entity-type statuses))))
          {}
          (analyzed-types)))

(mu/defn analyze-batch! :- nat-int?
  "Analyze up to `batch-size` analyzable entities whose AnalysisFindingStatus counts a write, is missing or is outdated,
  clearing each one's `stale` count unless a write raised it meanwhile, or counting its failure, returning how many it
  took; with `reported-only?`, only the ones the findings report lists."
  ([batch-size :- pos-int?]
   (analyze-batch! batch-size {}))
  ([batch-size :- pos-int?
    opts       :- [:map {:closed true} [:reported-only? {:optional true} :boolean]]]
   ;; The cache spans the select too: reading an entity attaches a `MetadataProvider` to its query
   ;; (see `metabase.lib-be.models.transforms/transform-query`), so selecting outside the cache gives every entity in
   ;; the batch a private one.
   (let [removed (remove-deleted-statuses! batch-size)]
     (lib-be/with-metadata-provider-cache
       (let [taken (take-pending-statuses! batch-size opts)]
         (doseq [[entity-type statuses] taken
                 :let [stale    (into {} (map (juxt :entity_id :stale)) statuses)
                       entities (dependencies.db/readable-entities
                                 #(dependencies.db/entities entity-type %)
                                 (set (keys stale))
                                 (fn [entity-id e]
                                   (log/errorf "Reading %s %s failed: %s" (name entity-type) entity-id (ex-message e))
                                   (record-failed-finding! entity-type entity-id e)
                                   (record-analysis-failure! entity-type entity-id)))]]
           (let [outcomes (task.util/map-in-parallel
                           (deps.settings/dependency-job-threads)
                           (fn [entity]
                             (try
                               {:entity entity :analysis (analysis entity)}
                               (catch Throwable e ;; catch OOMs
                                 (dependencies.db/throw-unless-app-db-reachable! e)
                                 {:entity entity :error e})))
                           entities)]
             (doseq [chunk (partition-all task.util/write-chunk-size outcomes)]
               (write-analyses! entity-type stale (filterv :analysis chunk)))
             (doseq [{:keys [entity error]} outcomes
                     :when error]
               (record-failure! entity-type (:id entity) error))
             (when-let [e (->> outcomes (keep :error) (remove #(instance? Exception %)) first)]
               (throw e))))
         (+ removed (reduce + (map count (vals taken)))))))))
