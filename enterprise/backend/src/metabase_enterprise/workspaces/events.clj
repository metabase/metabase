(ns metabase-enterprise.workspaces.events
  "Keep table remappings consistent with database updates that change `database-workspace-schema`."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.events.core :as events]
   [methodical.core :as methodical]))

(events/derive! ::database-update :metabase/event)
(events/derive! :event/database-update ::database-update)

(methodical/defmethod events/publish-event! ::database-update
  "Delete the remap rows that point at the old `database-workspace-schema` when an update
  changes it."
  [_topic {database :object previous-database :previous-object}]
  (ws/delete-stale-table-remappings! previous-database database))
