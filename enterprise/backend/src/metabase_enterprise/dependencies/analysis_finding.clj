(ns metabase-enterprise.dependencies.analysis-finding
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
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti ^:private instance-db-id
  "Gets the database id for a toucan instance"
  {:arglists '([toucan-instance])}
  t2/model)

(defmethod instance-db-id :default
  [toucan-instance]
  (:database_id toucan-instance))

(defmethod instance-db-id :model/Transform
  [toucan-instance]
  (or (some-> toucan-instance :source :query lib/database-id)
      ;; non-query transforms (e.g. Python) have no query to read the database from
      (:source_database_id toucan-instance)))

(defmethod instance-db-id :model/Segment
  [toucan-instance]
  (some-> toucan-instance :definition lib/database-id))

(defmulti ^:private pre-analysis-errors
  "Return a (possibly empty) sequence of errors detected without running the full analyzer. When
  non-empty, the entity is recorded broken with these errors and the regular analysis is skipped.
  Use this for structural failures e.g. an orphan Transform whose source database has been deleted."
  {:arglists '([toucan-instance])}
  t2/model)

(defmethod pre-analysis-errors :default [_] nil)

(defmethod pre-analysis-errors :model/Transform
  [{db-id :source_database_id id :id}]
  (when (nil? db-id)
    [(-> (lib/validation-exception-error "Source database for this transform has been deleted.")
         (assoc :source-entity-type :transform :source-entity-id id))]))

(defn upsert-analysis!
  "Given a Toucan entity, run its analysis and write the results into `:model/AnalysisFinding`, recording `version`,
  the `:analyzed_updated_at` and `:analyzed_count` of the entity analyzed, unless it is nil.

  If any row exists already, it is replaced. If it does not exist, it is created."
  ([toucan-instance]
   (upsert-analysis! toucan-instance nil))
  ([toucan-instance version]
   (when-not (lib-be/metadata-provider-cache)
     (throw (ex-info "FIXME: deps.analysis-finding/upsert-analysis! ran without reusing `MetadataProvider`s"
                     {:instance toucan-instance})))
   (let [model       (t2/model toucan-instance)
         entity-type (deps.dependency-types/model->dependency-type model)
         instance-id (:id toucan-instance)]
     (if-let [errors (seq (pre-analysis-errors toucan-instance))]
       (models.analysis-finding/upsert-analysis! entity-type instance-id false errors version)
       (if-let [db-id (instance-db-id toucan-instance)]
         (let [mp (lib-be/application-database-metadata-provider db-id)
               results (try (deps.analysis/check-entity mp entity-type instance-id)
                            (catch Exception e
                              (log/errorf "Error analyzing entity: %s" (ex-message e))
                              [(lib/validation-exception-error (.getMessage e))]))
               success (empty? results)]
           (models.analysis-finding/upsert-analysis! entity-type instance-id success results version))
         ;; No resolvable database, and no pre-analysis error explaining it: record an error so the entity gets a
         ;; finding instead of no-oping forever and being re-selected on every run. It re-checks normally if its
         ;; database later becomes resolvable.
         (models.analysis-finding/upsert-analysis!
          entity-type instance-id false
          [(lib/validation-exception-error "Could not resolve a database for this entity.")]
          version))))))

(defn- analyze-instance!
  "Analyze `instance`, recording `version` unless it is nil, and recording a failure as a failed finding of `version`
  so the entity is not analyzed again until it changes."
  [instance version]
  (try (upsert-analysis! instance version)
       (catch Exception e
         (log/errorf "Analyzing entity %s %s failed: %s"
                     (t2/model instance) (:id instance) (ex-message e))
         (try
           (models.analysis-finding/upsert-analysis!
            (deps.dependency-types/model->dependency-type (t2/model instance)) (:id instance) false
            [(lib/validation-exception-error (ex-message e))] version)
           (catch Exception record-e
             (log/errorf "Recording the failure of entity %s %s failed: %s"
                         (t2/model instance) (:id instance) (ex-message record-e)))))))

(def analyzable-entities
  "Entities for which we can compute analysis findings."
  #{:card :transform :segment})

(def ^:private AnalyzableEntityType
  "Schema for entity types supported by analysis findings."
  (into [:enum] analyzable-entities))

(mu/defn analyze-batch! :- nat-int?
  "Analyze up to `batch-size` entities of `type` whose AnalysisFinding is missing, was analyzed from another version of
  them, or by an older analysis, returning how many it analyzed."
  [type :- AnalyzableEntityType
   batch-size :- pos-int?]
  ;; The cache spans the select too: reading an entity attaches a `MetadataProvider` to its query
  ;; (see `metabase.lib-be.models.transforms/transform-query`), so selecting outside the cache gives every entity in
  ;; the batch a private one.
  (lib-be/with-metadata-provider-cache
    (let [pairs (models.analysis-finding/instances-for-analysis type batch-size)]
      (doseq [[instance version] pairs]
        (analyze-instance! instance version))
      (count pairs))))

(defn- analyze-transitive-dependents!
  "Analyze the analyzable transitive dependents of each of the entities in `type->ids`, `{entity-type ids}`, each
  dependent once, including those of the entities that depend on others."
  [type->ids]
  (let [dependents (apply merge-with into {}
                          (for [[entity-type ids] type->ids
                                id                ids]
                            (models.dependency/transitive-dependents {entity-type [{:id id}]})))]
    (doseq [[entity-type ids] dependents
            :when             (and (analyzable-entities entity-type) (seq ids))
            instance          (dependencies.db/instances entity-type (set ids))]
      (analyze-instance! instance nil))))

(mu/defn analyze-dependents-batch! :- nat-int?
  "Analyze the transitive dependents of up to `batch-size` entities whose dependents were not analyzed from their
  current version, or that were deleted, then record their versions, returning how many entities it took."
  [batch-size :- pos-int?]
  (lib-be/with-metadata-provider-cache
    (let [deleted  (into {}
                         (keep (fn [entity-type]
                                 (when-let [ids (not-empty (dependencies.db/deleted-status-entity-ids
                                                            :model/AnalysisFindingStatus entity-type batch-size))]
                                   [entity-type ids])))
                         deps.dependency-types/dependency-types)
          changed  (into []
                         (mapcat (fn [entity-type]
                                   (map #(assoc % :entity_type entity-type)
                                        (dependencies.db/entities-with-changed-version
                                         :model/AnalysisFindingStatus entity-type batch-size))))
                         deps.dependency-types/dependency-types)]
      (analyze-transitive-dependents!
       (merge-with into deleted (update-vals (group-by :entity_type changed) #(mapv :entity_id %))))
      (doseq [[entity-type ids] deleted]
        (dependencies.db/delete-statuses! :model/AnalysisFindingStatus entity-type ids))
      (doseq [{:keys [entity_type entity_id status_id status_updated_at version_updated_at version_count]} changed]
        (dependencies.db/record-status-version! :model/AnalysisFindingStatus entity_type entity_id
                                                status_id status_updated_at version_updated_at version_count))
      (+ (count changed) (reduce + 0 (map count (vals deleted)))))))
