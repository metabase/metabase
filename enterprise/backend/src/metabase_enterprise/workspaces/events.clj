(ns metabase-enterprise.workspaces.events
  "Event handlers to increment workspace graph versions when global transforms change."
  (:require
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; When a global transform is created, updated, or deleted, increment graph_version for all workspaces.
;; This is a conservative approach - we could be more selective by tracking which workspaces
;; reference which transforms, but the complexity of doing so would be brittle.

(defn- increment-all-workspace-graph-versions!
  "Increment graph_version for all workspaces, triggering graph recalculation."
  []
  (let [result (t2/query {:update :workspace
                          :set {:graph_version [:+ :graph_version 1]}})]
    (when (pos? (:next.jdbc/update-count result 0))
      (log/debug "Incremented graph_version for all workspaces due to global transform change"))))

;; These events are published by metabase.transforms-rest.api when transforms are
;; created, updated, or deleted. We subscribe to increment graph versions.

(derive ::workspace-staleness :metabase/event)
(derive :event/transform-create ::workspace-staleness)
(derive :event/transform-update ::workspace-staleness)
(derive :event/transform-delete ::workspace-staleness)

(methodical/defmethod events/publish-event! ::workspace-staleness
  [_ _event]
  ;; Increment graph_version for all workspaces when any global transform changes.
  ;; The graph will be recalculated lazily the next time we need it.
  (increment-all-workspace-graph-versions!))
