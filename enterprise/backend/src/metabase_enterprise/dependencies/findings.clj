(ns metabase-enterprise.dependencies.findings
  (:require
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
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
  (some-> toucan-instance :source :query lib/database-id))

(defmethod instance-db-id :model/Segment
  [toucan-instance]
  (some-> toucan-instance :definition lib/database-id))

(defn upsert-analysis!
  "Given a Toucan entity, run its analysis and write the results into `:model/AnalysisFinding`.

  If any row exists already, it is replaced. If it does not exist, it is created."
  [toucan-instance]
  (when-not (lib-be/metadata-provider-cache)
    (throw (ex-info "FIXME: deps.findings/upsert-analysis! ran without reusing `MetadataProvider`s"
                    {:instance toucan-instance})))
  (when-let [db-id (instance-db-id toucan-instance)]
    (let [mp (lib-be/application-database-metadata-provider db-id)
          model (t2/model toucan-instance)
          results (try
                    (deps.analysis/check-entity mp (deps.dependency-types/model->dependency-type model) (:id toucan-instance))
                    (catch Exception e
                      (log/error e "Error analyzing entity")
                      [(lib/validation-exception-error (.getMessage e))]))
          success (empty? results)]
      (deps.analysis-finding/upsert-analysis! (deps.dependency-types/model->dependency-type model) (:id toucan-instance) success results))))

(defn analyze-instances!
  "Given a series of toucan entities, upsert analyses for all of them and catch errors."
  [instances]
  (doseq [instance instances]
    (try (upsert-analysis! instance)
         (catch Exception e
           (log/errorf e "Analyzing entity %s %s failed"
                       (t2/model instance) (:id instance))))))

(def analyzable-entities
  "Entities for which we can compute analysis findings."
  #{:card :transform :segment})

(def ^:private AnalyzableEntityType
  "Schema for entity types supported by analysis findings."
  (into [:enum] analyzable-entities))

(def dependable-entities
  "Entities which can be depended on by other entities, even if they cannot themselves be analyzed.

  For example, `:table`s can be passed to [[mark-dependents-stale!]] as the upstream entity whose dependents are now
  stale, but we cannot analyze tables themselves."
  (conj analyzable-entities :table))

(def ^:private DependableEntityType
  "Schema for entity types supported by analysis findings."
  (into [:enum] dependable-entities))

(defn- mark-supported-dependents-stale!
  "Given a map of {entity-type [entity-ids]}, mark all supported types as stale.
  Returns true if any supported dependents were found."
  [dependents]
  (let [supported-dependents (into {}
                                   (filter (fn [[dep-type dep-ids]]
                                             (and (analyzable-entities dep-type)
                                                  (seq dep-ids))))
                                   dependents)]
    (doseq [[dep-type dep-ids] supported-dependents]
      (deps.analysis-finding/mark-stale! dep-type dep-ids))
    (boolean (seq supported-dependents))))

(mu/defn mark-dependents-stale! :- :boolean
  "Mark all transitive dependents of an entity as stale for re-analysis.
  Returns true if any supported dependents were found, false otherwise.

  Uses `transitive-dependents` (not `transitive-mbql-dependents`) because:
  1. It's faster - doesn't need to fetch entities to check for native-ness
  2. Native dependents marked stale will just be quickly re-validated as valid"
  [entity-type :- DependableEntityType
   entity-id   :- pos-int?]
  (let [dependents (models.dependency/transitive-dependents {entity-type [{:id entity-id}]})]
    (mark-supported-dependents-stale! dependents)))

(defn mark-all-dependents-stale!
  "Mark all transitive dependents of multiple entities as stale.
  Takes a map of {entity-type entity-ids} where entity-ids is a set of IDs.
  Returns true if any supported dependents were found."
  [type->entity-ids]
  (let [type->objects (update-vals type->entity-ids #(map (fn [id] {:id id}) %))
        dependents (models.dependency/transitive-dependents type->objects)]
    (mark-supported-dependents-stale! dependents)))

(mu/defn analyze-batch! :- nat-int?
  "Add or update analyses for a batch of entities.

  Takes in an entity type and batch size, and looks for a batch of entities with missing or out of date
  AnalysisFindings and then upsert new analyses for them."
  [type :- AnalyzableEntityType
   batch-size :- pos-int?]
  (let [instances (deps.analysis-finding/instances-for-analysis type batch-size)]
    (lib-be/with-metadata-provider-cache
      (analyze-instances! instances))
    (count instances)))
