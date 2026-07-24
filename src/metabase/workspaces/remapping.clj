(ns metabase.workspaces.remapping
  "Forward and reverse entity-ID remapping for workspaces.

  A workspace is a copy-on-write overlay over git-syncable entities: the first write to an
  entity inside a workspace copies it, and the copy's ID is recorded in
  `workspace_entity_remapping`. While a user has a workspace active (`core_user.workspace_id`),
  entity IDs coming in from the outside world (API params, saved references) are *source* IDs
  and should be resolved to the workspace copy with [[remapped-entity-id]] (forward); IDs of
  workspace copies going back out should be translated with [[source-entity-id]] (reverse).

  The `:model/Workspace` and `:model/WorkspaceEntityRemapping` models live in EE
  (`metabase-enterprise.workspaces.models.*`), so everything that touches them here is a
  `defenterprise` with an identity/no-op OSS stub — on OSS there is never an active
  workspace, so the stubs are the correct behavior, not a degradation."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn current-workspace-id :- [:maybe pos-int?]
  "ID of the current user's active workspace (`core_user.workspace_id`, carried on
  `api/*current-user*`), or nil when none is active. Use `with-redefs` on this fn in tests
  that need to force a workspace context without a real current user."
  []
  (:workspace_id @api/*current-user*))

(defn check-workspace-enabled
  "Assert that the current user has an active workspace (`core_user.workspace_id`); throw a
  400 otherwise. Use in endpoints that only make sense inside a workspace."
  []
  (api/check-400 (some? (current-workspace-id))
                 (tru "You must have an active workspace to perform this action.")))

(defn stamp-workspace-id
  "assoc `:workspace_id` with the current user's active workspace unless the key is already
  present (nil on main / OSS, where no workspace can be active). Call from `before-insert` of
  workspace-scoped models so rows created inside a workspace are tagged with it — including
  copy-on-write clones, which are always inserted in a workspace context."
  [instance]
  (cond-> instance
    (not (contains? instance :workspace_id))
    (assoc :workspace_id (current-workspace-id))))

(defn with-source-entity-id
  "Present a (possibly remapped) `entity` under `source-id`, the ID the client asked for, so
  clients keep a stable view of the graph. Identity for non-map or ID-less values."
  [entity source-id]
  (cond-> entity
    (and (map? entity) (:id entity))
    (assoc :id source-id)))

(defenterprise remapped-entity-id
  "Forward ID remapping: the ID to use in place of source entity `id` for the current user.
  Returns the workspace copy's ID when the active workspace has a remapping for
  (`model`, `id`); otherwise returns `id` unchanged. OSS: identity."
  metabase-enterprise.workspaces.impl
  [_model id]
  id)

(defenterprise source-entity-id
  "Reverse ID remapping: given `id` of an entity that may be a workspace copy, return the
  source (production) entity ID it was copied from, or `id` unchanged when it is not a copy
  in the current user's active workspace. OSS: identity."
  metabase-enterprise.workspaces.impl
  [_model id]
  id)

(defenterprise remapped-entity-ids
  "Batch forward remapping: map of source ID -> workspace copy ID for the subset of `ids`
  that have a remapping in the current user's active workspace. OSS / no active workspace:
  empty map."
  metabase-enterprise.workspaces.impl
  [_model _ids]
  {})

(defenterprise add-remapping!
  "Record that (`model`, `source-id`) maps to `target-id` in the current user's active
  workspace. POST endpoints call this with `source-id = target-id` after creating an entity,
  marking it workspace-owned. No-op on OSS or without an active workspace."
  metabase-enterprise.workspaces.impl
  [_model _source-id _target-id]
  nil)

(defenterprise delete-remapping!
  "DELETE hook: remove the active workspace's remapping row for (`model`, `source-id`) —
  call it after deleting the (remapped) entity row so no dangling mapping is left behind.
  No-op on OSS or without an active workspace."
  metabase-enterprise.workspaces.impl
  [_model _source-id]
  nil)

(defenterprise ensure-workspace-copy!
  "Copy-on-write hook for PUT endpoints. When the current user has an active workspace:
  return the ID of the entity's workspace copy, cloning the entity on first write (via the
  per-model [[metabase.workspaces.clone/clone-entity!]]) and recording the remapping.
  Otherwise returns `id` unchanged, so callers can use this unconditionally at the top of
  every PUT. OSS: identity."
  metabase-enterprise.workspaces.impl
  [_model id]
  id)

(defenterprise check-valid-workspace-id
  "Check that `workspace-id` may be set as a user's active workspace. On OSS any non-nil
  workspace-id is rejected, since workspaces are an enterprise feature."
  metabase-enterprise.workspaces.impl
  [workspace-id]
  (api/check-400 (nil? workspace-id)
                 (tru "Workspaces are a paid feature not currently available to your instance.")))
