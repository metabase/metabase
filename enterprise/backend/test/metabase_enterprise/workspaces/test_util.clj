(ns metabase-enterprise.workspaces.test-util
  "Shared test helpers for the workspaces module."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.models.remote-sync-worktree :as remote-sync-worktree]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.driver :as driver]
   [metabase.test :as mt]))

(defn driver-loadable?
  "True iff `engine`'s driver class is on the test classpath. Wraps
   `driver/the-initialized-driver` so tests that walk all workspace-capable
   drivers can `(when (driver-loadable? :sqlserver) ...)` to silently skip
   rows for drivers absent from the current `DRIVERS` env. Used by per-driver
   corpus / remapping tests where most drivers are off-classpath on the
   default H2-only run."
  [engine]
  (try (driver/the-initialized-driver engine) true
       (catch Throwable _ false)))

(defn with-workspace-db!
  "Make this instance a workspace in which the Database `db-id` writes to `schema`
   (its `database-workspace-schema`), run `thunk`, then turn workspace mode off and
   restore the database's settings. Teardown deletes every `TableRemapping` row."
  [db-id schema thunk]
  (mt/with-temp-vals-in-db :model/Database db-id {:settings {:database-workspace-schema schema}}
    (ws.settings/workspaces-enabled! true)
    (try (thunk)
         (finally (ws/clear-instance-workspace!)))))

(defn do-with-workspace-worktree
  "Calls `f` with the id of a remote sync worktree that names the workspace with `workspace-id`, deleting it after. The
  link is stored as it is: the API that sets it checks it ([[remote-sync-worktree/set-worktree-workspace!]])."
  [workspace-id f]
  (mt/with-additional-premium-features #{:remote-sync}
    (let [worktree-id (:id (remote-sync-worktree/create-remote-sync-worktree! {:branch (str "ws-" workspace-id)}))]
      (try
        (remote-sync.db/update-worktree! worktree-id {:workspace_id workspace-id})
        (f worktree-id)
        (finally
          (remote-sync-worktree/delete-remote-sync-worktree! worktree-id))))))

(defmacro with-workspace-worktree
  "Runs `body` with `worktree-id` bound to the id of a worktree that names the workspace with `workspace-id`; see
  [[do-with-workspace-worktree]]."
  [[worktree-id workspace-id] & body]
  `(do-with-workspace-worktree ~workspace-id (fn [~worktree-id] ~@body)))

(defn worktree-request
  "The request options of an API request in the worktree with `worktree-id`, or in the main app when it is nil."
  [worktree-id]
  {:request-options {:headers {"x-metabase-worktree-id" (str (or worktree-id 0))}}})
