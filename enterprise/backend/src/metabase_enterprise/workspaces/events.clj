(ns metabase-enterprise.workspaces.events
  "Event handlers to mark workspaces as stale when global transforms change."
  (:require
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; When a global transform is created, updated, or deleted, mark all workspaces as stale.
;; This is a conservative approach - we could be more selective by tracking which workspaces
;; reference which transforms, but for now simplicity wins.

(defn- mark-all-workspaces-stale!
  "Mark all workspaces as needing graph recalculation."
  []
  (let [count (t2/update! :model/Workspace {} {:analysis_stale true})]
    (when (pos? count)
      (log/debugf "Marked %d workspaces as analysis stale due to global transform change" count))))

;; ### Global Transform Events
;; These events are published by metabase-enterprise.transforms.api when transforms are
;; created, updated, or deleted. We subscribe to mark workspaces stale.

(derive ::workspace-staleness :metabase/event)
(derive :event/transform-create ::workspace-staleness)
(derive :event/transform-update ::workspace-staleness)
(derive :event/transform-delete ::workspace-staleness)

(methodical/defmethod events/publish-event! ::workspace-staleness
  [_ _event]
  ;; Mark all workspaces as stale when any global transform changes.
  ;; The graph will be recalculated lazily on next access.
  (mark-all-workspaces-stale!))
