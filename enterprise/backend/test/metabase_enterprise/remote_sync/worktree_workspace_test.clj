(ns metabase-enterprise.remote-sync.worktree-workspace-test
  "The workspace a remote sync worktree names, whose requests then work in it."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.models.remote-sync-worktree :as remote-sync-worktree]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk] (mt/with-premium-features #{:remote-sync :workspaces} (thunk))))

(defn- do-with-worktrees
  "Calls `f` with the ids of two worktrees and two workspaces, deleting them after."
  [f]
  (mt/with-temp [:model/Workspace {ws-a :id} {:name "ws-a"}
                 :model/Workspace {ws-b :id} {:name "ws-b"}]
    (mt/with-model-cleanup [:model/RemoteSyncWorktree]
      (let [wt-1 (:id (remote-sync-worktree/create-remote-sync-worktree! {:branch "wt-1"}))
            wt-2 (:id (remote-sync-worktree/create-remote-sync-worktree! {:branch "wt-2"}))]
        (f {:wt-1 wt-1 :wt-2 wt-2 :ws-a ws-a :ws-b ws-b})))))

(defn- put! [user status worktree-id workspace-id]
  (mt/user-http-request user :put status (format "ee/remote-sync/worktree/%d" worktree-id)
                        {:workspace_id workspace-id}))

(deftest only-a-superuser-sets-a-worktree-workspace-test
  (do-with-worktrees
   (fn [{:keys [wt-1 ws-a]}]
     (put! :rasta 403 wt-1 ws-a)
     (is (nil? (t2/select-one-fn :workspace_id :model/RemoteSyncWorktree :id wt-1))))))

(deftest a-worktree-workspace-needs-request-workspaces-test
  (do-with-worktrees
   (fn [{:keys [wt-1 ws-a]}]
     (testing "while requests can't work in a workspace, a worktree can't name one"
       (mt/with-dynamic-fn-redefs [workspaces/request-workspace-problem (constantly "Requests can't work in it.")]
         (is (= "Requests can't work in it." (put! :crowberto 400 wt-1 ws-a)))
         (is (nil? (t2/select-one-fn :workspace_id :model/RemoteSyncWorktree :id wt-1)))))
     (testing "on an H2 application database, the error says why"
       (is (string? (put! :crowberto 400 wt-1 ws-a)))))))

(deftest set-and-clear-a-worktree-workspace-test
  (do-with-worktrees
   (fn [{:keys [wt-1 wt-2 ws-a ws-b]}]
     (mt/with-dynamic-fn-redefs [workspaces/request-workspace-problem (constantly nil)]
       (testing "a worktree names a workspace, and the response shows it"
         (is (=? {:id wt-1 :workspace_id ws-a} (put! :crowberto 200 wt-1 ws-a)))
         (is (=? {:id wt-1 :workspace_id ws-a}
                 (mt/user-http-request :crowberto :get 200 (format "ee/remote-sync/worktree/%d" wt-1)))))
       (testing "a workspace is the workspace of at most one worktree"
         (put! :crowberto 409 wt-2 ws-a)
         (is (nil? (t2/select-one-fn :workspace_id :model/RemoteSyncWorktree :id wt-2))))
       (testing "a worktree changes its workspace"
         (is (=? {:workspace_id ws-b} (put! :crowberto 200 wt-1 ws-b)))))
     (testing "clearing needs no check, so it works while requests can't work in a workspace"
       (mt/with-dynamic-fn-redefs [workspaces/request-workspace-problem (constantly "Requests can't work in it.")]
         (is (=? {:id wt-1 :workspace_id nil} (put! :crowberto 200 wt-1 nil))))))))

(deftest the-main-app-names-no-workspace-test
  (mt/with-temp [:model/Workspace {ws-a :id} {:name "ws-a"}]
    (mt/with-dynamic-fn-redefs [workspaces/request-workspace-problem (constantly nil)]
      (let [default-id (t2/select-one-pk :model/RemoteSyncWorktree :is_default true)]
        (put! :crowberto 403 default-id ws-a)))))
