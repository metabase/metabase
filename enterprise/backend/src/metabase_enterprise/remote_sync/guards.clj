(ns metabase-enterprise.remote-sync.guards
  "Guard predicates used by mutating remote-sync operations to refuse running while
   another task is in flight.

   Lives in its own namespace because both `impl.clj` and `settings.clj` need to call
   it, and they do not currently share a common ancestor that could host it without
   creating a circular dependency."
  (:require
   [toucan2.core :as t2]))

(defn task-running?
  "Returns true if any RemoteSyncTask has `started_at` set and `ended_at` nil.

   Stricter than `models.remote-sync-task/current-task`: does not filter by
   `last_progress_report_at`, so it catches stalled or hung tasks that have stopped
   reporting progress but are still alive on a virtual thread. The trade-off is that
   `current-task` deliberately allows a stale task's slot to be reused (so a hung task
   doesn't block the system permanently); for guarding mutating operations we prefer
   the stricter check, since concurrent mutations against an in-flight task can cause
   data-coherence problems regardless of whether the task is reporting progress."
  []
  (t2/exists? :model/RemoteSyncTask
              {:where [:and [:<> :started_at nil]
                       [:= :ended_at nil]]}))

(defn ensure-no-active-task!
  "Throws an ex-info with status-code 400 if `task-running?` returns true.
   Used as a guard at the top of mutating remote-sync operations to make them
   refuse while a task is in flight."
  []
  (when (task-running?)
    (throw (ex-info "Remote sync task in progress"
                    {:status-code 400}))))
