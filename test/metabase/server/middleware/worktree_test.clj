(ns metabase.server.middleware.worktree-test
  "The workspace a request works in, which the remote sync worktree it works in names."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.server.middleware.worktree :as mw.worktree]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]))

(set! *warn-on-reflection* true)

(def ^:private worktrees
  "Worktree 5 names workspace 12, worktree 6 names none."
  {5 {:id 5 :is_default false :workspace_id 12}
   6 {:id 6 :is_default false :workspace_id nil}})

(defn- call
  "The response of [[mw.worktree/wrap-worktree]] to a request with `headers` from a superuser when `superuser?`, who
  checked out the worktree `checked-out`, around a handler that answers with the workspace id it runs in."
  ([superuser? headers]
   (call superuser? headers nil))
  ([superuser? headers checked-out]
   (mt/with-dynamic-fn-redefs [remote-sync/non-default-worktree-exists? (constantly true)
                               remote-sync/worktree-by-id               worktrees
                               remote-sync/user-worktree-id             (constantly checked-out)]
     (let [handler (mw.worktree/wrap-worktree
                    (fn [_request respond _raise]
                      (respond {:status 200, :body (workspaces/current-workspace-id)})))
           result  (promise)]
       (binding [api/*is-superuser?*   superuser?
                 api/*current-user-id* 1]
         (handler {:headers headers} #(deliver result %) #(deliver result %)))
       @result))))

(deftest a-worktree-request-works-in-its-workspace-test
  (mt/with-dynamic-fn-redefs [workspaces/request-workspace-problem (constantly nil)]
    (testing "a request in a worktree that names a workspace works in that workspace"
      (is (= {:status 200, :body 12} (call true {"x-metabase-worktree-id" "5"})))
      (is (= {:status 200, :body 12} (call true {} 5))))
    (testing "the binding ends with the request"
      (is (nil? (workspaces/current-workspace-id))))
    (testing "a request in a worktree that names none works in none"
      (is (= {:status 200, :body nil} (call true {"x-metabase-worktree-id" "6"}))))
    (testing "a request in the main app works in none"
      (is (= {:status 200, :body nil} (call true {"x-metabase-worktree-id" "0"} 5)))
      (is (= {:status 200, :body nil} (call false {}))))
    (testing "the removed header names no workspace"
      (is (= {:status 200, :body nil} (call true {"x-metabase-workspace-id" "12"}))))))

(deftest a-worktree-whose-workspace-requests-cannot-use-is-refused-test
  (mt/with-dynamic-fn-redefs [workspaces/request-workspace-problem (fn [workspace-id]
                                                                     (when (= 12 workspace-id) "Turned off."))]
    (testing "while requests can't work in the worktree's workspace, as when request-workspaces-enabled is off, its
              requests are refused, never run in no workspace"
      (is (= {:status 400, :body "Turned off."}
             (select-keys (call true {"x-metabase-worktree-id" "5"}) [:status :body])))
      (is (= 400 (:status (call true {} 5)))))
    (testing "the main app still works, to clear the worktree's workspace"
      (is (= {:status 200, :body nil} (call true {"x-metabase-worktree-id" "0"} 5))))))
