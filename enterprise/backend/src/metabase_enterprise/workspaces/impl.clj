(ns metabase-enterprise.workspaces.impl
  "Glue code connecting workspace subsystems (dependencies, isolation)."
  (:require
   [metabase-enterprise.workspaces.dependencies :as ws.deps]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- query-external-inputs
  "Query for external inputs in a workspace - inputs that are not shadowed by any output.
   Returns seq of WorkspaceInput records."
  [workspace-id]
  ;; TODO (ngoc 12/11/25) -- maybe we should have a flag on workspace_input.access_granted ?
  ;; NOTE: Could optimize with table_id join if workspace_output gets that column,
  ;; but not worth it given the small number of rows per workspace.
  (t2/select :model/WorkspaceInput
             :workspace_id workspace-id
             {:where [:not [:exists {:select [1]
                                     :from   [[:workspace_output :wo]]
                                     :where  [:and
                                              [:= :wo.workspace_id :workspace_input.workspace_id]
                                              [:= :wo.db_id :workspace_input.db_id]
                                              [:or
                                               [:and [:= :wo.global_schema nil] [:= :workspace_input.schema nil]]
                                               [:= :wo.global_schema :workspace_input.schema]]
                                              [:= :wo.global_table :workspace_input.table]]}]]}))

(defn- external-input->table
  [{:keys [schema table]}]
  {:schema schema
   :name   table})

(defn sync-transform-dependencies!
  "Analyze and persist dependencies for a workspace transform, then grant
   read access to external input tables."
  [{workspace-id :id, isolated-schema :schema :as workspace} transform]
  (let [analysis        (ws.deps/analyze-entity :transform transform)
        _               (ws.deps/write-dependencies! workspace-id isolated-schema :transform (:ref_id transform) analysis)
        external-inputs (query-external-inputs workspace-id)]
    (if-not (:database_details workspace)
      ;; TODO (chris 2025/12/15) we will want to make this strict before merging to master
      #_(throw (ex-info "No database details, unable to grant read only access to the service account." {}))
      (log/warn "No database details, unable to grant read only access to the service account.")
      (when (seq external-inputs)
        (let [database (t2/select-one :model/Database :id (:database_id workspace))
              tables   (mapv external-input->table external-inputs)]
          (ws.isolation/grant-read-access-to-tables! database workspace tables))))
    external-inputs))

(defn- build-remapping [workspace]
  ;; Build table remapping from stored WorkspaceOutput data.
  ;; Maps [db_id global_schema global_table] -> {:db-id :schema :table :id} for isolated tables.
  ;; This is used to remap transform targets (and later SQL/python sources) to isolated tables.
  (let [outputs    (t2/select [:model/WorkspaceOutput
                               :db_id :global_schema :global_table
                               :isolated_schema :isolated_table :isolated_table_id]
                              :workspace_id (:id workspace))
        table-map  (into {}
                         (map (fn [{:keys [db_id global_schema global_table
                                           isolated_schema isolated_table isolated_table_id]}]
                                [[db_id global_schema global_table]
                                 {:db-id  db_id
                                  :schema isolated_schema
                                  :table  isolated_table
                                  :id     isolated_table_id}]))
                         outputs)]
    {:tables (fn [[d s t]]
               ;; Look up from stored data, fall back to computing if not found (for new transforms)
               (or (get table-map [d s t])
                   {:db-id d, :schema (:schema workspace), :table (ws.u/isolated-table-name s t), :id nil}))
     ;; We won't need the field-map until we support MBQL.
     :fields nil}))

(defn- backfill-isolated-table-id!
  "Backfill workspace_output.isolated_table_id FK in the case where we just created the table for the first time."
  [ref-id]
  ;; TODO we can roll this into a single query
  (when-let [table-id (:id (t2/query-one
                            {:from   [[:workspace_output :wo]]
                             :join   [[:metabase_table :t] [:and
                                                            [:= :t.db_id :wo.db_id]
                                                            [:= :t.schema :wo.isolated_schema]
                                                            [:= :t.name :wo.isolated_table]]]
                             :select [:t.id]
                             :where  [:or [:= :wo.isolated_schema nil] [:not= :t.id :wo.isolated_table_id]]}))]
    (t2/update! :model/WorkspaceOutput {:ref_id ref-id} {:isolated_table_id table-id})))

(defn run-transform!
  "Execute the given workspace transform"
  ([workspace transform]
   (run-transform! workspace transform (build-remapping workspace)))
  ([workspace transform remapping]
   (let [ref-id (:ref_id transform)
         result (isolation/with-workspace-isolation workspace (ws.execute/run-transform-with-remapping transform remapping))]
     (when (= :succeeded (:status result))
       (t2/update! :model/WorkspaceTransform ref-id {:last_run_at (:end_time result)})
       (backfill-isolated-table-id! ref-id))
     result)))

(defn execute-workspace!
  "Execute all the transforms within a given workspace."
  [workspace & {:keys [stale-only?] :or {stale-only? false}}]
  (let [ws-id     (:id workspace)
        remapping (build-remapping workspace)]
    (reduce
     (fn [acc {ref-id :ref_id :as transform}]
       (try
         ;; Perhaps we want to return some of the metadata from this as well?
         (if (= :succeeded (:status (run-transform! workspace transform remapping)))
           (update acc :succeeded conj ref-id)
           ;; Perhaps the status might indicate it never ran?
           (update acc :failed conj ref-id))
         (catch Exception e
           (log/error e "Failed to execute transform" {:workspace-id ws-id :transform-ref-id ref-id})
           (update acc :failed conj ref-id))))
     {:succeeded []
      :failed    []
      :not_run   []}
     ;; Right now we're running things in random order, and skipping all the enclosed transforms (because
     ;; we don't about them yet). Once we've got the graph analysis, we can order things appropriately, and
     ;; skip execution of anything with a failed ancestor.
     ;; Or, for simplicity and frugality, we might want to just shortcircuit on the first failure.
     (t2/select [:model/WorkspaceTransform :ref_id :name :description :source :target] :workspace_id ws-id
                ;; 1. Depending on what we end up storing in this field, we might not be considering stale ancestors.
                ;; 2. For now, we never set this field to false, so we'll always run everything, even with the flag.
                ;; Why is there all this weird code then? To avoid unused references.
                (if stale-only? {:where [:= :stale true]} {})))))
