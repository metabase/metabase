(ns metabase.workspaces.remapping
  "Forward and reverse entity-ID remapping for workspaces.

  A workspace is a copy-on-write overlay over git-syncable entities: the first write to an
  entity inside a workspace copies it, and the copy's ID is recorded in
  `workspace_entity_remapping`. While a user has a workspace active (`core_user.workspace_id`),
  entity IDs coming in from the outside world (API params, saved references) are *source* IDs
  and should be resolved to the workspace copy with [[remapped-entity-id]] (forward); IDs of
  workspace copies going back out should be translated with [[source-entity-id]] (reverse).
  Without an active workspace both functions are identity.

  SQL queries that join on affected entities can join through the `workspace_entity_remapping`
  table directly; these helpers are for the single-ID hot path."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.workspaces.clone :as workspaces.clone]
   [metabase.workspaces.schema :as workspaces.schema]
   [toucan2.core :as t2]))

(mu/defn current-workspace-id :- [:maybe pos-int?]
  "ID of the current user's active workspace, or nil when none is active. Reads
  [[metabase.api.common/*current-workspace-id*]], which is bound alongside `*current-user*`
  for every request; bind it (to a bare ID) in tests to force a workspace context."
  []
  (force api/*current-workspace-id*))

(defn check-workspace-enabled
  "Assert that the current user has an active workspace (`core_user.workspace_id`); throw a
  400 otherwise. Use in endpoints that only make sense inside a workspace."
  []
  (api/check (some? (current-workspace-id))
             [400 (tru "You must have an active workspace to perform this action.")]))

(mu/defn remapped-entity-id :- pos-int?
  "Forward ID remapping: the ID to use in place of source entity `id` for the current user.
  Returns the workspace copy's ID when the active workspace has a remapping for
  (`model`, `id`); otherwise returns `id` unchanged."
  [model :- ::workspaces.schema/entity-type
   id    :- pos-int?]
  (or (when-let [workspace-id (current-workspace-id)]
        (t2/select-one-fn :target_entity_id :model/WorkspaceEntityRemapping
                          :workspace_id workspace-id
                          :entity_type model
                          :source_entity_id id))
      id))

(mu/defn source-entity-id :- pos-int?
  "Reverse ID remapping: given `id` of an entity that may be a workspace copy, return the
  source (production) entity ID it was copied from, or `id` unchanged when it is not a copy
  in the current user's active workspace."
  [model :- ::workspaces.schema/entity-type
   id    :- pos-int?]
  (or (when-let [workspace-id (current-workspace-id)]
        (t2/select-one-fn :source_entity_id :model/WorkspaceEntityRemapping
                          :workspace_id workspace-id
                          :entity_type model
                          :target_entity_id id))
      id))

(mu/defn remapped-entity-ids :- [:map-of pos-int? pos-int?]
  "Batch forward remapping: map of source ID -> workspace copy ID for the subset of `ids`
  that have a remapping in the current user's active workspace. Empty map without an active
  workspace or when nothing is remapped."
  [model :- ::workspaces.schema/entity-type
   ids   :- [:maybe [:or [:set pos-int?] [:sequential pos-int?]]]]
  (or (when-let [workspace-id (current-workspace-id)]
        (when (seq ids)
          (into {}
                (map (juxt :source_entity_id :target_entity_id))
                (t2/select [:model/WorkspaceEntityRemapping :source_entity_id :target_entity_id]
                           :workspace_id workspace-id
                           :entity_type model
                           :source_entity_id [:in (set ids)]))))
      {}))

(defn with-source-entity-id
  "Present a (possibly remapped) `entity` under `source-id`, the ID the client asked for, so
  clients keep a stable view of the graph. Identity for non-map or ID-less values."
  [entity source-id]
  (cond-> entity
    (and (map? entity) (:id entity))
    (assoc :id source-id)))

(mu/defn add-remapping!
  "Record that (`model`, `source-id`) maps to `target-id` in the current user's active
  workspace. POST endpoints call this with `source-id = target-id` after creating an entity,
  marking it workspace-owned. No-op without an active workspace."
  [model     :- ::workspaces.schema/entity-type
   source-id :- pos-int?
   target-id :- pos-int?]
  (when-let [workspace-id (current-workspace-id)]
    (t2/insert! :model/WorkspaceEntityRemapping
                {:workspace_id     workspace-id
                 :entity_type      model
                 :source_entity_id source-id
                 :target_entity_id target-id}))
  nil)

(mu/defn delete-remapping!
  "DELETE hook: remove the active workspace's remapping row for (`model`, `source-id`) —
  call it after deleting the (remapped) entity row so no dangling mapping is left behind.
  No-op without an active workspace."
  [model     :- ::workspaces.schema/entity-type
   source-id :- pos-int?]
  (when-let [workspace-id (current-workspace-id)]
    (t2/delete! :model/WorkspaceEntityRemapping
                :workspace_id workspace-id
                :entity_type model
                :source_entity_id source-id))
  nil)

(mu/defn ensure-workspace-copy! :- pos-int?
  "Copy-on-write hook for PUT endpoints. When the current user has an active workspace:
  return the ID of the entity's workspace copy, cloning the entity on first write (via the
  per-model [[metabase.workspaces.clone/clone-entity!]]) and recording the remapping.
  Without an active workspace returns `id` unchanged, so callers can use this
  unconditionally at the top of every PUT."
  [model :- ::workspaces.schema/entity-type
   id    :- pos-int?]
  (if-let [workspace-id (current-workspace-id)]
    (or (t2/select-one-fn :target_entity_id :model/WorkspaceEntityRemapping
                          :workspace_id workspace-id
                          :entity_type model
                          :source_entity_id id)
        (t2/with-transaction [_conn]
          (let [clone-id (workspaces.clone/clone-entity! model id)]
            (t2/insert! :model/WorkspaceEntityRemapping
                        {:workspace_id     workspace-id
                         :entity_type      model
                         :source_entity_id id
                         :target_entity_id clone-id})
            clone-id)))
    id))

(defenterprise check-valid-workspace-id
  "Check that `workspace-id` may be set as a user's active workspace. On OSS any non-nil
  workspace-id is rejected, since workspaces are an enterprise feature."
  metabase-enterprise.workspaces.impl
  [workspace-id]
  (api/check (nil? workspace-id)
             [400 (tru "Workspaces are a paid feature not currently available to your instance. Please upgrade to use it.")]))
