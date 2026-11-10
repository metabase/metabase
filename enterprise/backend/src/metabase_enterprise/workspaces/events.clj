(ns metabase-enterprise.workspaces.events
  "Keep table remappings consistent with database updates that change `database-workspace-schema`."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.events.core :as events]
   [methodical.core :as methodical]))

(events/derive! ::database-update :metabase/event)
(events/derive! :event/database-update ::database-update)

(methodical/defmethod events/publish-event! ::database-update
  "`PUT /api/database/:id` can change `database-workspace-schema`; delete the remap rows
  that point at the old schema."
  [_topic {database :object previous-database :previous-object}]
  (ws/delete-stale-table-remappings! previous-database database))
