(ns metabase-enterprise.workspaces.events
  "Keep table remappings consistent with database updates that change `database-workspace-schema`, and drop the cache
  of the workspaces that requests name when a Database changes."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.request-workspace :as ws.request-workspace]
   [metabase.events.core :as events]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]))

(events/derive! ::database-update :metabase/event)
(events/derive! :event/database-update ::database-update)

(methodical/defmethod events/publish-event! ::database-update
  "Delete the remap rows that point at the old `database-workspace-schema` when an update
  changes it. Drop the cache of the workspaces that requests name: the Database's details decide whether a workspace
  can use its login there ([[metabase-enterprise.workspaces.login/login-problem]])."
  [_topic {:keys [object previous-object] :as event}]
  (ws.request-workspace/invalidate!)
  (when (u.events/changed? event :settings)
    (ws/delete-stale-table-remappings! previous-object object)))
