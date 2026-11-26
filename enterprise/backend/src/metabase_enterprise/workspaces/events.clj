(ns metabase-enterprise.workspaces.events
  "Keep table remappings consistent with database updates that change `database-workspace-schema`, and drop the cache
  of the workspaces of worktrees when a Database changes."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.request-workspace :as ws.request-workspace]
   [metabase.events.core :as events]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]))

(events/derive! ::database-update :metabase/event)
(events/derive! :event/database-update ::database-update)

(methodical/defmethod events/publish-event! ::database-update
  "Delete the remap rows that point at the old `database-workspace-schema` of the databases whose update changes it.
  Drop the cache of the workspaces of worktrees: the Database's details decide whether a workspace can use its
  login there ([[metabase-enterprise.workspaces.login/login-problem]])."
  [_topic {:keys [changes]}]
  (ws.request-workspace/invalidate!)
  (ws/delete-stale-table-remappings! (filter #(u.events/changed? % :settings) changes)))
