(ns metabase-enterprise.workspaces.remapping
  "EE implementations of the workspace `defenterprise` hooks declared in
  [[metabase.workspaces.remapping]]. Everything is gated on the `:workspaces` premium
  feature: if the token loses the feature, the OSS identity/no-op stubs take over and the
  overlay is disabled, even for users who still have a `workspace_id` set.

  `workspace_entity_remapping.entity_type` is stored as the plain kebab-case keyword produced
  by [[metabase.workspaces.remapping/model->entity-type]] (e.g. `:card`, not `:model/Card`) --
  every query here converts the Toucan model keyword it's given before touching the table."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.workspaces.core :as workspaces]
   [metabase.workspaces.remapping :as ws.remapping]
   [toucan2.core :as t2]))

(defn- workspace-target-id?
  "True when `id` is already the `target_entity_id` of one of this `workspace-id`'s
  remappings for `entity-type` -- i.e. `id` is itself a workspace copy, not a source id.
  Listings and search intentionally hand copies out under their own real ids (see the
  workspace visibility filters), so any hook here that receives an id from the outside world
  must treat a copy id as already-resolved rather than as a source to look up or clone."
  [workspace-id entity-type id]
  (t2/exists? :model/WorkspaceEntityRemapping
              :workspace_id workspace-id
              :entity_type entity-type
              :target_entity_id id))

(defenterprise remapped-entity-id
  "EE impl: the workspace copy's ID for (`model`, `id`) in the current user's active
  workspace, or `id` when there is no active workspace or no remapping. `id` that is already
  a copy's own id (a target_entity_id) is returned unchanged -- it does not need remapping,
  and must not be treated as a source id."
  :feature :workspaces
  [model id]
  (or (when-let [workspace-id (workspaces/current-workspace-id)]
        (let [entity-type (ws.remapping/model->entity-type model)]
          (if (workspace-target-id? workspace-id entity-type id)
            id
            (t2/select-one-fn :target_entity_id :model/WorkspaceEntityRemapping
                              :workspace_id workspace-id
                              :entity_type entity-type
                              :source_entity_id id))))
      id))

(defenterprise source-entity-id
  "EE impl: the source entity ID that (`model`, `id`) was copied from in the current user's
  active workspace, or `id` when it is not a workspace copy."
  :feature :workspaces
  [model id]
  (or (when-let [workspace-id (workspaces/current-workspace-id)]
        (t2/select-one-fn :source_entity_id :model/WorkspaceEntityRemapping
                          :workspace_id workspace-id
                          :entity_type (ws.remapping/model->entity-type model)
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
                           :entity_type (ws.remapping/model->entity-type model)
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
                 :entity_type      (ws.remapping/model->entity-type model)
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
                :entity_type (ws.remapping/model->entity-type model)
                :source_entity_id source-id))
  nil)

(defenterprise ensure-workspace-copy!
  "EE impl of the PUT copy-on-write hook: return the ID of the entity's workspace copy,
  cloning via the per-model [[metabase.workspaces.clone/clone-entity!]] and recording the
  remapping on first write. Identity without an active workspace.

  `id` may itself already be a copy's own id -- collection/search listings hand workspace
  copies out under their real ids (per the visibility filters), so a UI flow can load an
  entity from a listing and PUT back its copy id rather than the source id. Cloning that
  id as though it were a fresh source would insert a second copy with the same `entity_id`
  in the same workspace, violating the (entity_id, workspace_id_helper) unique index. Guard
  against that by returning `id` unchanged when it is already one of this workspace's
  targets, before ever looking it up as a source or cloning it."
  :feature :workspaces
  [model id]
  (if-let [workspace-id (workspaces/current-workspace-id)]
    (let [entity-type (ws.remapping/model->entity-type model)]
      (or (when (workspace-target-id? workspace-id entity-type id)
            id)
          (t2/select-one-fn :target_entity_id :model/WorkspaceEntityRemapping
                            :workspace_id workspace-id
                            :entity_type entity-type
                            :source_entity_id id)
          (t2/with-transaction [_conn]
            (let [clone-id (workspaces/clone-entity! model id)]
              (t2/insert! :model/WorkspaceEntityRemapping
                          {:workspace_id     workspace-id
                           :entity_type      entity-type
                           :source_entity_id id
                           :target_entity_id clone-id})
              clone-id))))
    id))

(defenterprise check-valid-workspace-id
  "Check that `workspace-id` refers to an existing workspace the current user can read (403
  otherwise — workspaces are admin-only for now); throw a 400 when it does not exist. Nil is
  always fine — it clears the user's active workspace."
  :feature :workspaces
  [workspace-id]
  (when workspace-id
    (api/check-400 (t2/exists? :model/Workspace :id workspace-id)
                   (tru "Workspace {0} does not exist." workspace-id))
    (api/read-check :model/Workspace workspace-id)))
