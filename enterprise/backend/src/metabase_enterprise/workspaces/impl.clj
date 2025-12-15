(ns metabase-enterprise.workspaces.impl
  "Glue code connecting workspace subsystems (dependencies, isolation)."
  (:require
   [metabase-enterprise.workspaces.dependencies :as ws.deps]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
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
