(ns metabase-enterprise.dependencies.analysis-finding
  (:require
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
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
  the `:analyzed_updated_at` of the entity analyzed, unless it is nil.

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

(def ^:private AnalyzableEntityType
  "Schema for entity types supported by analysis findings."
  (into [:enum] analyzable-entities))

(mu/defn analyze-batch! :- nat-int?
  "Analyze up to `batch-size` entities of `type` whose AnalysisFinding is missing, records a version older than theirs,
  which includes the versions of the entities they depend on, or an older analysis, returning how many it analyzed."
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
