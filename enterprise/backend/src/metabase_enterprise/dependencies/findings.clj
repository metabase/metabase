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
          results (try (deps.analysis/check-entity mp (deps.dependency-types/model->dependency-type model) (:id toucan-instance))
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
  "Given a map of {entity-type [entity-ids]}, mark all supported (analyzable) types as stale.
  For non-analyzable entities (e.g., tables), looks through to their dependents so the wave
  can reach analyzable entities beyond them.
  Returns true if any supported dependents were found."
  [dependents]
  (let [{analyzable true non-analyzable false}
        (group-by (fn [[dep-type _]] (boolean (analyzable-entities dep-type)))
                  (filter (fn [[_ dep-ids]] (seq dep-ids)) dependents))
        ;; For non-analyzable entities, find their direct dependents
        pass-through-dependents
        (when (seq non-analyzable)
          (let [key-seq (for [[dep-type dep-ids] non-analyzable
                              id dep-ids]
                          [dep-type id])
                deps-map (models.dependency/direct-dependents key-seq)]
            (models.dependency/group-nodes (into #{} cat (vals deps-map)))))
        ;; Merge the analyzable dependents with the pass-through dependents
        all-supported (merge-with into
                                  (into {} analyzable)
                                  (into {}
                                        (filter (fn [[dep-type _]] (analyzable-entities dep-type)))
                                        pass-through-dependents))]
    (doseq [[dep-type dep-ids] all-supported]
      (deps.analysis-finding/mark-stale! dep-type dep-ids))
    (boolean (seq all-supported))))

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

(defn mark-all-immediate-dependents-stale!
  "Mark the immediate dependents of multiple entities as stale.
  Takes a map of {entity-type entity-ids} where entity-ids is a set of IDs.
  Does NOT traverse transitively — the entity-check job loop propagates in waves.
  Returns true if any supported dependents were found."
  [type->entity-ids]
  (let [key-seq (for [[entity-type ids] type->entity-ids
                      id ids]
                  [entity-type id])
        deps-map (models.dependency/direct-dependents key-seq)
        dependents (models.dependency/group-nodes
                    (into #{} cat (vals deps-map)))]
    (mark-supported-dependents-stale! dependents)))

(mu/defn mark-entity-stale!
  "Mark a single entity as stale for re-analysis by the background job."
  [entity-type :- AnalyzableEntityType
   entity-id   :- pos-int?]
  (deps.analysis-finding/mark-stale! entity-type [entity-id]))

(mu/defn mark-immediate-dependents-stale! :- :boolean
  "Mark the immediate dependents of an entity as stale.
  Unlike [[mark-dependents-stale!]], this does NOT traverse transitively."
  [entity-type :- DependableEntityType
   entity-id   :- pos-int?]
  (let [key-seq [[entity-type entity-id]]
        deps-map (models.dependency/direct-dependents key-seq)
        dependents (models.dependency/group-nodes
                    (into #{} cat (vals deps-map)))]
    (mark-supported-dependents-stale! dependents)))

(defn- analyze-and-propagate!
  "Analyze an entity and mark its immediate dependents as stale.
  Wrapped in a transaction so that if marking dependents fails, the analysis
  is rolled back and the entity stays stale for retry on the next pass.
  The newly-stale dependents are picked up by the job's loop in
  `task.entity-check/check-entities!`, which drains all stale entities
  before returning — no need to re-trigger the job."
  [instance]
  (let [entity-type (deps.dependency-types/model->dependency-type (t2/model instance))]
    (t2/with-transaction [_conn]
      (upsert-analysis! instance)
      (mark-immediate-dependents-stale! entity-type (:id instance)))))

(mu/defn analyze-batch! :- nat-int?
  "Add or update analyses for a batch of entities.

  Takes in an entity type and batch size, and looks for a batch of entities with missing or out of date
  AnalysisFindings and then upsert new analyses for them."
  [type :- AnalyzableEntityType
   batch-size :- pos-int?]
  (let [instances (deps.analysis-finding/instances-for-analysis type batch-size)]
    (lib-be/with-metadata-provider-cache
      (doseq [instance instances]
        (try (analyze-and-propagate! instance)
             (catch Exception e
               (log/errorf e "Analyzing entity %s %s failed"
                           (t2/model instance) (:id instance))))))
    (count instances)))
