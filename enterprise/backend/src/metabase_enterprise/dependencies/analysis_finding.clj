(ns metabase-enterprise.dependencies.analysis-finding
  "Analyzes the entities whose AnalysisFindingStatus a write marked stale, recording what each one's query no longer finds."
  (:require
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti ^:private entity-db-id
  "The database ID of `entity`."
  {:arglists '([entity])}
  t2/model)

(defmethod entity-db-id :default
  [entity]
  (:database_id entity))

(defmethod entity-db-id :model/Transform
  [entity]
  (or (some-> entity :source :query lib/database-id)
      ;; non-query transforms (e.g. Python) have no query to read the database from
      (:source_database_id entity)))

(defmethod entity-db-id :model/Segment
  [entity]
  (some-> entity :definition lib/database-id))

(defmulti ^:private pre-analysis-errors
  "The set of errors of `entity` found without running the analysis, such as an orphan Transform's, which when not
  empty are recorded instead of running it."
  {:arglists '([entity])}
  t2/model)

(defmethod pre-analysis-errors :default [_] nil)

(defmethod pre-analysis-errors :model/Transform
  [{db-id :source_database_id id :id}]
  (when (nil? db-id)
    #{(-> (lib/validation-exception-error "Source database for this transform has been deleted.")
          (assoc :source-entity-type :transform :source-entity-id id))}))

(mu/defn upsert-analysis!
  "Analyze the Toucan entity `entity` and insert or replace its AnalysisFinding, reusing the caller's metadata provider
  cache when it has one."
  [entity :- [:fn {:error/message "a Toucan instance"} t2/instance?]]
  (lib-be/with-metadata-provider-cache
    (let [model       (t2/model entity)
          entity-type (deps.dependency-types/model->dependency-type model)
          entity-id   (:id entity)]
      (if-let [errors (not-empty (pre-analysis-errors entity))]
        (models.analysis-finding/upsert-analysis! entity-type entity-id false errors)
        (if-let [db-id (entity-db-id entity)]
          (let [mp (lib-be/application-database-metadata-provider db-id)
                results (try (deps.analysis/check-entity mp entity-type entity-id)
                             (catch Exception e
                               (log/errorf "Error analyzing entity: %s" (ex-message e))
                               #{(lib/validation-exception-error (.getMessage e))}))
                success (empty? results)]
            (models.analysis-finding/upsert-analysis! entity-type entity-id success results))
          (models.analysis-finding/upsert-analysis!
           entity-type entity-id false
           #{(lib/validation-exception-error "Could not resolve a database for this entity.")}))))))

(mu/defn- analyze-entity!
  "Analyze `entity`, recording a failure as a failed finding."
  [entity :- [:fn {:error/message "a Toucan instance"} t2/instance?]]
  (try (upsert-analysis! entity)
       (catch Exception e
         (log/errorf "Analyzing entity %s %s failed: %s"
                     (t2/model entity) (:id entity) (ex-message e))
         (try
           (models.analysis-finding/upsert-analysis!
            (deps.dependency-types/model->dependency-type (t2/model entity)) (:id entity) false
            #{(lib/validation-exception-error (ex-message e))})
           (catch Exception record-e
             (log/errorf "Recording the failure of entity %s %s failed: %s"
                         (t2/model entity) (:id entity) (ex-message record-e)))))))

(def analyzable-entities
  "Entities for which we can compute analysis findings."
  #{:card :transform :segment})

(mu/defn- remove-deleted-statuses! :- nat-int?
  "Delete the AnalysisFindingStatuses of up to `batch-size` deleted entities of each analyzable type, returning how
  many it deleted."
  [batch-size :- pos-int?]
  (reduce + (for [entity-type (sort analyzable-entities)
                  :let        [ids (dependencies.db/analysis-finding-deleted-entity-ids entity-type batch-size)]]
              (if (seq ids)
                (dependencies.db/delete-analysis-finding-statuses! entity-type ids)
                0))))

(mu/defn- claim-batch! :- [:map-of ::deps.dependency-types/dependency-types [:sequential ms/PositiveInt]]
  "Claim up to `batch-size` analyzable entities whose AnalysisFindingStatus is stale, missing or outdated, as
  `{entity-type ids}`."
  [batch-size :- pos-int?]
  (reduce (fn [claimed entity-type]
            (let [remaining (- batch-size (reduce + (map count (vals claimed))))
                  ids       (when (pos? remaining)
                              (dependencies.db/analysis-finding-pending-entity-ids
                               entity-type remaining models.analysis-finding/*current-analysis-finding-version*
                               models.dependency/current-dependency-analysis-version))]
              (if (seq ids)
                (do (dependencies.db/claim-analysis-finding-statuses!
                     entity-type ids models.analysis-finding/*current-analysis-finding-version*)
                    (assoc claimed entity-type ids))
                claimed)))
          {}
          (sort analyzable-entities)))

(mu/defn analyze-batch! :- nat-int?
  "Claim and analyze up to `batch-size` analyzable entities whose AnalysisFindingStatus is stale, missing or outdated,
  returning how many it took."
  [batch-size :- pos-int?]
  ;; The cache spans the select too: reading an entity attaches a `MetadataProvider` to its query
  ;; (see `metabase.lib-be.models.transforms/transform-query`), so selecting outside the cache gives every entity in
  ;; the batch a private one.
  (let [removed (remove-deleted-statuses! batch-size)]
    (lib-be/with-metadata-provider-cache
      (let [claimed (claim-batch! batch-size)]
        (doseq [[entity-type ids] claimed
                entity            (dependencies.db/entities entity-type (set ids))]
          (analyze-entity! entity))
        (+ removed (reduce + (map count (vals claimed))))))))
