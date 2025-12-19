(ns metabase-enterprise.workspaces.impl
  "Glue code connecting workspace subsystems (dependencies, isolation)."
  (:require
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.dependencies :as ws.deps]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- query-ungranted-external-inputs
  "Query for external inputs in a workspace that haven't been granted access yet.
   External inputs are tables that are not shadowed by any output.
   Returns seq of WorkspaceInput records where access_granted is false."
  [workspace-id]
  ;; NOTE: Could optimize with table_id join if workspace_output gets that column,
  ;; but not worth it given the small number of rows per workspace.
  (t2/select :model/WorkspaceInput
             :workspace_id workspace-id
             {:where [:and
                      [:= :workspace_input.access_granted false]
                      [:not [:exists {:select [1]
                                      :from   [[:workspace_output :wo]]
                                      :where  [:and
                                               [:= :wo.workspace_id :workspace_input.workspace_id]
                                               [:= :wo.db_id :workspace_input.db_id]
                                               [:or
                                                [:and [:= :wo.global_schema nil] [:= :workspace_input.schema nil]]
                                                [:= :wo.global_schema :workspace_input.schema]]
                                               [:= :wo.global_table :workspace_input.table]]}]]]}))

(defn- external-input->table
  [{:keys [schema table]}]
  {:schema schema
   :name   table})

(defn sync-grant-accesses!
  "Grant read access to external input tables for a workspace that haven't been granted yet.
   External inputs are tables that are read by transforms but not produced by any transform in the workspace.
   This should be called after adding transforms to a workspace or when re-initializing workspace isolation
   (e.g., after unarchiving)."
  [{workspace-id :id :as workspace}]
  (let [ungranted-inputs (query-ungranted-external-inputs workspace-id)]
    (if-not (:database_details workspace)
      ;; TODO (chris 2025/12/15) we will want to make this strict before merging to master
      #_(throw (ex-info "No database details, unable to grant read only access to the service account." {}))
      (log/warn "No database details, unable to grant read only access to the service account.")
      (when (seq ungranted-inputs)
        (let [database (t2/select-one :model/Database :id (:database_id workspace))
              tables   (mapv external-input->table ungranted-inputs)]
          (try
            (ws.isolation/grant-read-access-to-tables! database workspace tables)
            ;; Mark inputs as granted after successful grant
            (t2/update! :model/WorkspaceInput {:id [:in (map :id ungranted-inputs)]}
                        {:access_granted true})
            (catch Exception e
              (log/warn e "Error granting RO table permissions"))))))))

(defn sync-transform-dependencies!
  "Analyze and persist dependencies for a workspace transform, then grant
   read access to external input tables."
  [{workspace-id :id, isolated-schema :schema :as workspace} transform]
  (let [analysis (ws.deps/analyze-entity :transform transform)]
    (ws.deps/write-dependencies! workspace-id isolated-schema :transform (:ref_id transform) analysis)
    (sync-grant-accesses! workspace)))

(defn- build-remapping [workspace]
  ;; Build table remapping from stored WorkspaceOutput data.
  ;; Maps [db_id global_schema global_table] -> {:db-id :schema :table :id} for isolated tables.
  ;; Also maps global_table_id -> same. This is more convenient and reliable for MBQL queries and Python transforms.
  ;; This is used to remap queries, sources and targets to reflect the "isolated" tables used to seal the Workspace.
  (let [outputs    (t2/select [:model/WorkspaceOutput
                               :db_id :global_schema :global_table :global_table_id
                               :isolated_schema :isolated_table :isolated_table_id]
                              :workspace_id (:id workspace))
        table-map  (reduce
                    (fn [m {:keys [db_id global_schema global_table global_table_id
                                   isolated_schema isolated_table isolated_table_id]}]
                      (let [replacement {:db-id  db_id
                                         :schema isolated_schema
                                         :table  isolated_table
                                         :id     isolated_table_id}]
                        (cond-> (assoc m [db_id global_schema global_table] replacement)
                          global_table_id (assoc global_table_id replacement))))
                    {}
                    outputs)]
    {:tables          table-map
     ;; We never want to write to any global tables, so remap on-the-fly if we hit an un-mapped target.
     :target-fallback (fn [[d s t]]
                        (log/warn "Missing remapping for" {:db d :schema s, :table s})
                        {:db-id d, :schema (:schema workspace), :table (ws.u/isolated-table-name s t), :id nil})
     ;; We won't need the field-map until we support MBQL.
     :fields          nil}))

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
         result (ws.isolation/with-workspace-isolation workspace (ws.execute/run-transform-with-remapping transform remapping))]
     (when (= :succeeded (:status result))
       (t2/update! :model/WorkspaceTransform ref-id {:last_run_at (:end_time result)})
       (backfill-isolated-table-id! ref-id))
     result)))

;; TODO save graph with invalidation hooks
(defn get-or-calculate-graph
  "Return the graph. Going to be cached in the future."
  [{ws-id :id :as _workspace}]
  (ws.dag/path-induced-subgraph ws-id (t2/select-fn-vec (fn [{:keys [ref_id]}] {:entity-type :transform :id ref_id})
                                                        [:model/WorkspaceTransform :ref_id]
                                                        :workspace_id ws-id)))

(defn- transforms-to-execute
  "Given a workspace and an optional filter, return the global and workspace definitions to run, in the correct order."
  [{ws-id :id :as workspace} & {:keys [stale-only?]}]
  ;; 1. Depending on what we end up storing in this field, we might not be considering stale ancestors.
  ;; 2. For now, we never set this field to false, so we'll always run everything, even with the flag.
  ;; Why is there all this weird code then? To avoid unused references.
  (let [stale-clause (if stale-only? {:where [:= :stale true]} {})
        entities     (:entities (get-or-calculate-graph workspace))
        type->ids    (u/group-by :node-type :id entities)
        id->tx       (merge
                      {}
                      (when-let [ids (seq (type->ids :external-transform))]
                        (t2/select-fn->fn :id identity
                                          [:model/Transform :id :name :source :target]
                                          :id [:in ids]
                                          stale-clause))
                      (when-let [ref-ids (seq (type->ids :workspace-transform))]
                        (t2/select-fn->fn :ref_id identity
                                          [:model/WorkspaceTransform :ref_id :name :source :target]
                                          :workspace_id ws-id
                                          :ref_id [:in ref-ids]
                                          stale-clause)))]
    (keep (comp id->tx :id) entities)))

(defn- id->str [ref-id-or-id]
  (if (string? ref-id-or-id)
    ref-id-or-id
    (str "global-id:" ref-id-or-id)))

(defn execute-workspace!
  "Execute all the transforms within a given workspace."
  [workspace & {:keys [stale-only?] :or {stale-only? false}}]
  (let [ws-id     (:id workspace)
        remapping (build-remapping workspace)]
    (reduce
     (fn [acc {external-id :id ref-id :ref_id :as transform}]
       (let [node-type (if external-id :external-transform :workspace-transform)
             id-str    (id->str (or external-id ref-id))]
         (try
           ;; Perhaps we want to return some of the metadata from this as well?
           (if (= :succeeded (:status (run-transform! workspace transform remapping)))
             (update acc :succeeded conj id-str)
             ;; Perhaps the status might indicate it never ran?
             (update acc :failed conj id-str))
           (catch Exception e
             (log/error e "Failed to execute transform" {:workspace-id ws-id :node-type node-type :id id-str})
             (update acc :failed conj id-str)))))
     {:succeeded []
      :failed    []
      :not_run   []}
     (transforms-to-execute workspace {:stale-only stale-only?}))))
