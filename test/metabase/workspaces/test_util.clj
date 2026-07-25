(ns metabase.workspaces.test-util
  "Test helpers for workspace copy-on-write tests."
  (:require
   [metabase.test :as mt]
   [metabase.workspaces.remapping]
   [toucan2.core :as t2]))

(comment metabase.workspaces.remapping/keep-me)

(set! *warn-on-reflection* true)

(defn do-in-workspace
  "Activate workspace `workspace-id` for test user `user` (a `mt/user->id` keyword), run
  `thunk` with the `:workspaces` premium feature enabled, always deactivate. Sets
  `core_user.workspace_id` directly so the workspace context is picked up by the session
  middleware on every request the thunk makes."
  [user workspace-id thunk]
  (t2/update! :model/User (mt/user->id user) {:workspace_id workspace-id})
  (try
    (mt/with-premium-features #{:workspaces}
      (thunk))
    (finally
      (t2/update! :model/User (mt/user->id user) {:workspace_id nil}))))

(defmacro in-workspace
  "Execute `body` with workspace `workspace-id` active for :crowberto."
  [workspace-id & body]
  `(do-in-workspace :crowberto ~workspace-id (fn [] ~@body)))

(defmacro with-current-workspace-id
  "Execute `body` with [[metabase.workspaces.remapping/current-workspace-id]] redefined to
  return `workspace-id` and the `:workspaces` feature enabled — forces a workspace context
  without a real current user. `with-redefs` is thread-global, so this applies to *all*
  users/requests in `body` (don't use it in `^:parallel` tests, or in tests that need one
  user in the workspace and another outside it — use [[in-workspace]] for those)."
  [workspace-id & body]
  `(with-redefs [metabase.workspaces.remapping/current-workspace-id (constantly ~workspace-id)]
     (mt/with-premium-features #{:workspaces}
       ~@body)))
