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
  "Given a Toucan entity, run its analysis and write the results into `:model/AnalysisFinding`.

  If any row exists already, it is replaced. If it does not exist, it is created."
  [toucan-instance]
  (when-not (lib-be/metadata-provider-cache)
    (throw (ex-info "FIXME: deps.findings/upsert-analysis! ran without reusing `MetadataProvider`s"
                    {:instance toucan-instance})))
  (let [model       (t2/model toucan-instance)
        entity-type (deps.dependency-types/model->dependency-type model)
        instance-id (:id toucan-instance)]
    (if-let [errors (seq (pre-analysis-errors toucan-instance))]
      (deps.analysis-finding/upsert-analysis! entity-type instance-id false errors)
      (if-let [db-id (instance-db-id toucan-instance)]
        (let [mp (lib-be/application-database-metadata-provider db-id)
              results (try (deps.analysis/check-entity mp entity-type instance-id)
                           (catch Exception e
                             (log/error e "Error analyzing entity")
                             [(lib/validation-exception-error (.getMessage e))]))
              success (empty? results)]
          (deps.analysis-finding/upsert-analysis! entity-type instance-id success results))
        ;; No resolvable database, and no pre-analysis error explaining it: record a terminal error so
        ;; the entity gets a finding (clearing its stale flag) instead of no-oping forever and being
        ;; re-selected on every run. It re-checks normally if its database later becomes resolvable.
        (deps.analysis-finding/upsert-analysis!
         entity-type instance-id false
         [(lib/validation-exception-error "Could not resolve a database for this entity.")])))))

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

  For example, `:table`s can be passed to [[mark-transitive-dependents-stale!]] as an upstream entity whose dependents are now
  stale, but we cannot analyze tables themselves."
  (conj analyzable-entities :table))

(defn- mark-supported-dependents-stale!
  "Given a map of {entity-type [entity-ids]}, mark all supported (analyzable) types as stale.
  For non-analyzable entities (e.g., tables), looks through to their dependents so we still
  reach analyzable entities beyond them.
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

(defn mark-transitive-dependents-stale!
  "Mark all transitive dependents of the given upstream entities stale for re-analysis. Takes `{entity-type [entity-ids]}`
  — entity types may be non-analyzable (e.g. `:table`), since they can still have analyzable dependents, and each id
  collection may be any seqable (vector, set, ...). Returns true if any supported (analyzable) dependents were found.

  Uses `transitive-dependents` (not `transitive-mbql-dependents`) because:
  1. It's faster - doesn't need to fetch entities to check for native-ness
  2. Native dependents marked stale will just be quickly re-validated as valid"
  [type->entity-ids]
  (-> (models.dependency/transitive-dependents
       (update-vals type->entity-ids (fn [ids] (map (fn [id] {:id id}) ids))))
      mark-supported-dependents-stale!))

(mu/defn mark-entity-stale!
  "Mark a single entity as stale for re-analysis by the background job."
  [entity-type :- AnalyzableEntityType
   entity-id   :- pos-int?]
  (deps.analysis-finding/mark-stale! entity-type [entity-id]))

(mu/defn mark-entity-and-transitive-dependents-stale!
  "Mark `entity-id` and all of its transitive dependents stale for re-analysis. Use this when an entity changes: it
  queues the whole affected subtree up front so the entity-check job drains a fixed set of stale entities (see
  [[metabase-enterprise.dependencies.task.entity-check/check-entities!]]) without re-propagating staleness during the
  drain — which can never terminate when the dependency graph has a cycle."
  [entity-type :- AnalyzableEntityType
   entity-id   :- pos-int?]
  (mark-entity-stale! entity-type entity-id)
  (mark-transitive-dependents-stale! {entity-type [entity-id]}))

(mu/defn analyze-batch! :- nat-int?
  "Add or update analyses for a batch of entities.

  Takes in an entity type and batch size, and looks for a batch of entities with missing or out of date
  AnalysisFindings and then upsert new analyses for them.

  This only *analyzes* (each [[upsert-analysis!]] clears that entity's stale flag); it does NOT propagate staleness to
  dependents. Propagation happens up front when an entity changes (see [[mark-entity-and-transitive-dependents-stale!]] and the
  event handlers), so the entity-check job drains a fixed set of stale entities that only shrinks — guaranteeing
  termination even when the dependency graph has cycles."
  [type :- AnalyzableEntityType
   batch-size :- pos-int?]
  (let [instances (deps.analysis-finding/instances-for-analysis type batch-size)]
    (lib-be/with-metadata-provider-cache
      (doseq [instance instances]
        (try (upsert-analysis! instance)
             (catch Exception e
               (log/errorf e "Analyzing entity %s %s failed"
                           (t2/model instance) (:id instance))))))
    (count instances)))
