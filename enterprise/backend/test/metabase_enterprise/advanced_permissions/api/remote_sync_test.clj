(ns metabase-enterprise.advanced-permissions.api.remote-sync-test
  "Permissions tests for the remote-sync worktree API, which is gated on the `:remote-sync` application permission.
  The worktree API itself is covered in `metabase-enterprise.remote-sync.worktree-test`."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.test :as mt]))

(deftest worktree-permissions-test
  (testing "/api/ee/remote-sync/worktree"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (mt/with-temp [:model/Worktree {wt-id :id} {}]
        (letfn [(list-worktrees [user]
                  (testing (format "list worktrees with %s user" (mt/user-descriptor user))
                    (mt/user-http-request user :get 200 "ee/remote-sync/worktree")))
                (get-worktree [user status]
                  (testing (format "get worktree with %s user" (mt/user-descriptor user))
                    (mt/user-http-request user :get status (format "ee/remote-sync/worktree/%d" wt-id))))]
          (testing "if `advanced-permissions` is disabled, require admins"
            (mt/with-premium-features #{:remote-sync}
              (is (= [] (list-worktrees user)))
              (get-worktree user 403)
              (is (seq (list-worktrees :crowberto)))
              (get-worktree :crowberto 200)))
          (testing "if `advanced-permissions` is enabled"
            (mt/with-premium-features #{:advanced-permissions :remote-sync}
              (testing "still fail if user's group doesn't have `remote-sync` permission"
                (is (= [] (list-worktrees user)))
                (get-worktree user 403))
              (testing "allowed if user's group has `remote-sync` permission"
                (perms/grant-application-permissions! group :remote-sync)
                (is (= [wt-id] (map :id (list-worktrees user))))
                (get-worktree user 200)))))))))
