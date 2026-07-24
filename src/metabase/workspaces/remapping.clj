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
   [metabase.workspaces.schema :as workspaces.schema]
   [toucan2.core :as t2]))

(mu/defn current-workspace-id :- [:maybe pos-int?]
  "ID of the current user's active workspace, or nil when none is active."
  []
  (:workspace_id @api/*current-user*))

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

(defenterprise check-valid-workspace-id
  "Check that `workspace-id` may be set as a user's active workspace. On OSS any non-nil
  workspace-id is rejected, since workspaces are an enterprise feature."
  metabase-enterprise.workspaces.impl
  [workspace-id]
  (api/check (nil? workspace-id)
             [400 (tru "Workspaces are a paid feature not currently available to your instance. Please upgrade to use it.")]))
