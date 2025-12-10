(ns metabase-enterprise.workspaces.dependencies
  "Workspace-local dependency tracking.

   Unlike the global dependency table which links to table_id (requiring the table to exist and be synced),
   workspace dependencies link to workspace_input which stores logical table references that don't require
   the table to exist yet."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.calculation :as deps.calc]
   [metabase-enterprise.workspaces.models.workspace-dependency]
   [metabase-enterprise.workspaces.models.workspace-input]
   [metabase-enterprise.workspaces.models.workspace-output]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

;;; ---------------------------------------- Schemas ----------------------------------------

(mr/def ::table-ref
  "A reference to a table, with optional table_id if the table exists in the appdb."
  [:map
   [:database_id :int]
   [:schema [:maybe :string]]
   [:table :string]
   [:table_id {:optional true} [:maybe :int]]])

(mr/def ::output-ref
  "A reference to an output table (transform target)."
  [:map
   [:database_id :int]
   [:schema [:maybe :string]]
   [:table :string]])

(mr/def ::analysis
  "The result of analyzing an entity's dependencies."
  [:map
   [:output ::output-ref]
   [:inputs [:sequential ::table-ref]]])

(defn- table-metadata
  "Look up the table metadata for a table ID. Returns a map with :database_id, :schema, :table, :table_id."
  [table-id]
  (when-let [{:keys [db_id schema name]} (t2/select-one [:model/Table :db_id :schema :name] :id table-id)]
    {:database_id db_id
     :schema      schema
     :table       name
     :table_id    table-id}))

(defn- output-from-target
  "Extract output table info from a transform's :target field."
  [{:keys [database schema name] :as _target}]
  {:database_id database
   :schema      schema
   :table       name})

(mu/defn analyze-entity :- ::analysis
  "Analyze a workspace entity to find its dependencies.

   Arguments:
   - entity-type: keyword, must be :transform (asserted)
   - entity: the workspace transform map with :source and :target

   Returns:
   {:output {:database_id int :schema string :table string}
    :inputs [{:database_id int :schema string :table string :table_id int} ...]}"
  [entity-type :- :keyword
   entity      :- :map]
  (ws.u/assert-transform! entity-type)
  (let [upstream-deps (deps.calc/upstream-deps:transform entity)
        table-ids     (:table upstream-deps)]
    {:output (output-from-target (:target entity))
     :inputs (vec (keep table-metadata table-ids))}))

(defn- upsert-workspace-output!
  "Upsert a workspace_output record for the transform's target table.
   Returns the workspace_output id."
  [workspace-id ref-id {:keys [database_id schema table]}]
  (let [existing (t2/select-one :model/WorkspaceOutput :workspace_id workspace-id :ref_id ref-id)]
    (if existing
      (do
        (t2/update! :model/WorkspaceOutput (:id existing)
                    {:database_id database_id
                     :schema      schema
                     :table       table})
        (:id existing))
      (:id (t2/insert-returning-instance! :model/WorkspaceOutput
                                          {:workspace_id workspace-id
                                           :ref_id       ref-id
                                           :database_id  database_id
                                           :schema       schema
                                           :table        table})))))

(defn- find-matching-output
  "Check if the given table reference matches an existing workspace_output (internal dependency).
   Returns the output id if found, nil otherwise."
  [workspace-id {:keys [database_id schema table]}]
  (t2/select-one-pk :model/WorkspaceOutput
                    :workspace_id workspace-id
                    :database_id database_id
                    :schema schema
                    :table table))

(defn- upsert-workspace-input!
  "Upsert a workspace_input record for an external table dependency.
   Returns the workspace_input id."
  [workspace-id {:keys [database_id schema table table_id]}]
  (let [existing (t2/select-one :model/WorkspaceInput
                                :workspace_id workspace-id
                                :database_id database_id
                                :schema schema
                                :table table)]
    (if existing
      (do
        ;; Update table_id in case it changed (table was synced/deleted)
        (when (not= (:table_id existing) table_id)
          (t2/update! :model/WorkspaceInput (:id existing) {:table_id table_id}))
        (:id existing))
      (:id (t2/insert-returning-instance! :model/WorkspaceInput
                                          {:workspace_id workspace-id
                                           :database_id  database_id
                                           :schema       schema
                                           :table        table
                                           :table_id     table_id})))))

(defn- create-dependency-edges!
  "Create workspace_dependency edges from the transform to its inputs.
   Returns the set of new edge specs for comparison."
  [workspace-id ref-id dep-specs]
  (doseq [{:keys [to_entity_type to_entity_id]} dep-specs]
    (t2/insert! :model/WorkspaceDependency
                {:workspace_id     workspace-id
                 :from_entity_type :transform
                 :from_entity_id   ref-id
                 :to_entity_type   to_entity_type
                 :to_entity_id     to_entity_id
                 :created_at       [:now]}))
  (set dep-specs))

(defn- delete-stale-edges!
  "Delete dependency edges that are no longer present."
  [workspace-id ref-id current-edges new-edges]
  (let [stale-edges (set/difference current-edges new-edges)]
    (doseq [{:keys [to_entity_type to_entity_id]} stale-edges]
      (t2/delete! :model/WorkspaceDependency
                  :workspace_id workspace-id
                  :from_entity_type :transform
                  :from_entity_id ref-id
                  :to_entity_type to_entity_type
                  :to_entity_id to_entity_id))))

(defn- current-edge-specs
  "Get the current dependency edge specs for a transform."
  [workspace-id ref-id]
  (->> (t2/select [:model/WorkspaceDependency :to_entity_type :to_entity_id]
                  :workspace_id workspace-id
                  :from_entity_type :transform
                  :from_entity_id ref-id)
       (map #(select-keys % [:to_entity_type :to_entity_id]))
       set))

(mu/defn write-dependencies! :- :nil
  "Persist dependency analysis for a workspace entity.

   Arguments:
   - workspace-id: int
   - entity-type: keyword, must be :transform
   - ref-id: string, the workspace_transform.ref_id
   - analysis: result from analyze-entity

   Side effects:
   - Upserts workspace_output for this transform
   - Upserts workspace_input for each external table dependency
   - Creates workspace_dependency edges
   - Deletes stale edges"
  [workspace-id :- :int
   entity-type  :- :keyword
   ref-id       :- :string
   {:keys [output inputs]} :- ::analysis]
  (ws.u/assert-transform! entity-type)
  (t2/with-transaction [_conn]
    ;; 1. Upsert the output for this transform
    (upsert-workspace-output! workspace-id ref-id output)

    ;; 2. For each input, determine if it's internal (output) or external (input)
    ;;    and create the appropriate record
    (let [current-edges (current-edge-specs workspace-id ref-id)
          new-dep-specs (for [input inputs]
                          (if-let [output-id (find-matching-output workspace-id input)]
                            ;; Internal dependency - points to another transform's output
                            {:to_entity_type :output
                             :to_entity_id   output-id}
                            ;; External dependency - points to an external table
                            (let [input-id (upsert-workspace-input! workspace-id input)]
                              {:to_entity_type :input
                               :to_entity_id   input-id})))
          new-dep-specs-set (set new-dep-specs)
          ;; Only create edges that don't already exist
          edges-to-create (set/difference new-dep-specs-set current-edges)]

      ;; 3. Create new dependency edges
      (create-dependency-edges! workspace-id ref-id edges-to-create)

      ;; 4. Delete stale edges
      (delete-stale-edges! workspace-id ref-id current-edges new-dep-specs-set))))
