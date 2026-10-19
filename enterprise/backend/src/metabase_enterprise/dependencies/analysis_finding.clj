(ns metabase-enterprise.dependencies.analysis-finding
  (:require
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
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
  the version of the entity analyzed, unless it is nil.

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
         (models.analysis-finding/upsert-analysis!
          entity-type instance-id false
          [(lib/validation-exception-error "Could not resolve a database for this entity.")]
          version))))))

(defn- analyze-instance!
  "Analyze `instance`, recording `version` unless it is nil, and recording a failure as a failed finding."
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

(defn- pending-entities
  "Up to `batch-size` entities whose AnalysisFindingStatus is missing, records another version or an older analysis,
  as `[entity-type {:id :version}]` pairs: entities the job analyzes, and the other entities some entity depends on."
  [batch-size]
  (reduce (fn [pending entity-type]
            (let [remaining (- batch-size (count pending))]
              (if (pos? remaining)
                (into pending
                      (map (partial vector entity-type))
                      (dependencies.db/analysis-finding-pending-entities
                       entity-type remaining models.analysis-finding/*current-analysis-finding-version*
                       models.dependency/current-dependency-analysis-version
                       (contains? analyzable-entities entity-type)))
                (reduced pending))))
          []
          (sort deps.dependency-types/dependency-types)))

(defn- remove-deleted-statuses!
  "Delete the AnalysisFindingStatuses of up to `batch-size` deleted entities of each type, returning how many it
  deleted."
  [batch-size]
  (reduce + (for [entity-type (sort deps.dependency-types/dependency-types)
                  :let        [ids (dependencies.db/analysis-finding-deleted-entity-ids entity-type batch-size)]]
              (if (seq ids)
                (dependencies.db/delete-analysis-finding-statuses! entity-type ids)
                0))))

(defn- process-entities!
  "Analyze the analyzable entities among the `[entity-type {:id :version}]` `pending` ones, recording the version of
  each in its status, which the others only record."
  [pending]
  (doseq [[entity-type entities] (group-by first pending)
          :let                   [versions  (into {} (map (comp (juxt :id :version) second)) entities)
                                  instances (when (contains? analyzable-entities entity-type)
                                              (dependencies.db/instances entity-type (set (keys versions))))]]
    (if instances
      (doseq [instance instances]
        (analyze-instance! instance (versions (:id instance))))
      (doseq [[id version] versions]
        (dependencies.db/upsert-analysis-finding-status!
         entity-type id models.analysis-finding/*current-analysis-finding-version* version)))))

(mu/defn analyze-batch! :- nat-int?
  "Process up to `batch-size` entities whose AnalysisFindingStatus is missing, records another version or none, or an
  older analysis: clear the versions of the transitive dependents of those that changed, so they are processed in
  turn, then analyze the analyzable ones and record the version of each, returning how many it took."
  [batch-size :- pos-int?]
  ;; The cache spans the select too: reading an entity attaches a `MetadataProvider` to its query
  ;; (see `metabase.lib-be.models.transforms/transform-query`), so selecting outside the cache gives every entity in
  ;; the batch a private one.
  (let [removed (remove-deleted-statuses! batch-size)]
    (lib-be/with-metadata-provider-cache
      (let [pending (pending-entities batch-size)]
        (when (seq pending)
          (dependencies.db/clear-analysis-finding-versions!
           (models.dependency/transitive-dependents
            (u/group-by first second (filter (comp :changed second) pending))))
          (process-entities! pending))
        (+ removed (count pending))))))
