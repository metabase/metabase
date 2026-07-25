(ns metabase-enterprise.workspaces.impl
  "EE implementations of the workspace `defenterprise` hooks declared in
  [[metabase.workspaces.remapping]]. Everything is gated on the `:workspaces` premium
  feature: if the token loses the feature, the OSS identity/no-op stubs take over and the
  overlay is disabled, even for users who still have a `workspace_id` set."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(defenterprise remapped-entity-id
  "EE impl: the workspace copy's ID for (`model`, `id`) in the current user's active
  workspace, or `id` when there is no active workspace or no remapping."
  :feature :workspaces
  [model id]
  (or (when-let [workspace-id (workspaces/current-workspace-id)]
        (t2/select-one-fn :target_entity_id :model/WorkspaceEntityRemapping
                          :workspace_id workspace-id
                          :entity_type model
                          :source_entity_id id))
      id))

(defenterprise source-entity-id
  "EE impl: the source entity ID that (`model`, `id`) was copied from in the current user's
  active workspace, or `id` when it is not a workspace copy."
  :feature :workspaces
  [model id]
  (or (when-let [workspace-id (workspaces/current-workspace-id)]
        (t2/select-one-fn :source_entity_id :model/WorkspaceEntityRemapping
                          :workspace_id workspace-id
                          :entity_type model
                          :target_entity_id id))
      id))

(defenterprise remapped-entity-ids
  "EE impl: map of source ID -> workspace copy ID for the subset of `ids` with a remapping
  in the current user's active workspace."
  :feature :workspaces
  [model ids]
  (or (when-let [workspace-id (workspaces/current-workspace-id)]
        (when (seq ids)
          (into {}
                (map (juxt :source_entity_id :target_entity_id))
                (t2/select [:model/WorkspaceEntityRemapping :source_entity_id :target_entity_id]
                           :workspace_id workspace-id
                           :entity_type model
                           :source_entity_id [:in (set ids)]))))
      {}))

(defenterprise add-remapping!
  "EE impl: record that (`model`, `source-id`) maps to `target-id` in the current user's
  active workspace. No-op without an active workspace."
  :feature :workspaces
  [model source-id target-id]
  (when-let [workspace-id (workspaces/current-workspace-id)]
    (t2/insert! :model/WorkspaceEntityRemapping
                {:workspace_id     workspace-id
                 :entity_type      model
                 :source_entity_id source-id
                 :target_entity_id target-id}))
  nil)

(defenterprise delete-remapping!
  "EE impl: remove the active workspace's remapping row for (`model`, `source-id`). No-op
  without an active workspace."
  :feature :workspaces
  [model source-id]
  (when-let [workspace-id (workspaces/current-workspace-id)]
    (t2/delete! :model/WorkspaceEntityRemapping
                :workspace_id workspace-id
                :entity_type model
                :source_entity_id source-id))
  nil)

(defenterprise ensure-workspace-copy!
  "EE impl of the PUT copy-on-write hook: return the ID of the entity's workspace copy,
  cloning via the per-model [[metabase.workspaces.clone/clone-entity!]] and recording the
  remapping on first write. Identity without an active workspace."
  :feature :workspaces
  [model id]
  (if-let [workspace-id (workspaces/current-workspace-id)]
    (or (t2/select-one-fn :target_entity_id :model/WorkspaceEntityRemapping
                          :workspace_id workspace-id
                          :entity_type model
                          :source_entity_id id)
        (t2/with-transaction [_conn]
          (let [clone-id (workspaces/clone-entity! model id)]
            (t2/insert! :model/WorkspaceEntityRemapping
                        {:workspace_id     workspace-id
                         :entity_type      model
                         :source_entity_id id
                         :target_entity_id clone-id})
            clone-id)))
    id))

(defenterprise check-valid-workspace-id
  "Check that `workspace-id` refers to an existing workspace; throw a 400 otherwise. Nil is
  always fine — it clears the user's active workspace."
  :feature :workspaces
  [workspace-id]
  (when workspace-id
    (api/check-400 (t2/exists? :model/Workspace :id workspace-id)
                   (tru "Workspace {0} does not exist." workspace-id))))
