(ns metabase.workspaces.test-util
  "Test helpers for workspace copy-on-write tests."
  (:require
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn do-in-workspace
  "Activate workspace `workspace-id` for test user `user` (a `mt/user->id` keyword), run
  `thunk`, always deactivate. Sets `core_user.workspace_id` directly so the workspace context
  is picked up by the session middleware on every request the thunk makes."
  [user workspace-id thunk]
  (t2/update! :model/User (mt/user->id user) {:workspace_id workspace-id})
  (try
    (thunk)
    (finally
      (t2/update! :model/User (mt/user->id user) {:workspace_id nil}))))

(defmacro in-workspace
  "Execute `body` with workspace `workspace-id` active for :crowberto."
  [workspace-id & body]
  `(do-in-workspace :crowberto ~workspace-id (fn [] ~@body)))
