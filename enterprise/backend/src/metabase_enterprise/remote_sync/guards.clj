(ns metabase-enterprise.remote-sync.guards
  "Guard predicates used by mutating remote-sync operations to refuse running while
   another task is in flight, and to opportunistically clean up stale rows so a JVM
   crash or hung thread doesn't block the system permanently.

   Lives in its own namespace because both `impl.clj` and `settings.clj` need to call
   it, and they do not currently share a common ancestor that could host it without
   creating a circular dependency."
  (:require
   [metabase-enterprise.remote-sync.models.remote-sync-task :as rst]))

(defn task-running?
  "Returns true if a remote-sync task is currently *active* — started, not ended, and has
   reported progress recently (within `remote-sync-task-time-limit-ms`). Delegates to
   `current-task`, so a stale task (no progress reports for longer than the timeout) does
   NOT count as running. Stale rows get cleaned up by `ensure-no-active-task!`'s supersession
   step, which means user-driven operations self-heal from JVM crashes and hung threads
   the same way auto-import does."
  []
  (some? (rst/current-task)))

(defn ensure-no-active-task!
  "Throws an ex-info with status-code 400 if a remote-sync task is currently active. After
   the check passes, calls `supersede-stale-tasks!` to mark any stale rows as cancelled +
   terminated so they don't interfere with the operation about to run.

   Used as a guard at the top of mutating remote-sync operations. Combined with
   `handle-task-result!`'s already-terminated check, this means an old task's late-arriving
   thread will detect its row is terminated and exit without writing the setting or
   overwriting bookkeeping."
  []
  (when (task-running?)
    (throw (ex-info "Remote sync task in progress"
                    {:status-code 400})))
  (rst/supersede-stale-tasks!))
