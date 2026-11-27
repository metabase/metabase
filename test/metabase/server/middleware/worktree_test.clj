(ns metabase.server.middleware.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.server.middleware.worktree :as mw.worktree]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- run-middleware
  "The scope `wrap-worktree`'s inner handler ran in for a request with the worktree `header`, or the response it sent
  instead, as the user with `user-id`, a superuser when `superuser?`."
  [user-id superuser? header]
  (let [seen    (promise)
        handler (mw.worktree/wrap-worktree
                 (fn [_request respond _raise] (respond {:scope (mdb/worktree-scope)})))
        request {:headers (cond-> {} header (assoc "x-metabase-worktree-id" header))}]
    (binding [api/*current-user-id* user-id
              api/*is-superuser?*   superuser?]
      (handler request seen identity))
    (let [result (deref seen 1000 ::timeout)]
      (if (:scope result) (:scope result) (:status result)))))

(deftest request-without-worktree-runs-across-every-worktree-test
  (testing "signed-in request runs in every worktree while none but default one exists"
    (is (= {:type :all} (run-middleware (mt/user->id :crowberto) true nil)))
    (is (= {:type :all} (run-middleware (mt/user->id :rasta) false nil))))
  (testing "request without user runs in default worktree"
    (is (= {:type :main} (run-middleware nil false nil)))))

(deftest request-scope-with-worktree-test
  (when config/ee-available?
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temp [:model/RemoteSyncWorktree {worktree-id :id}       {:branch "test-branch"}
                     :model/RemoteSyncWorktree {other-worktree-id :id} {:branch "other-branch"}]
        (let [admin-id (mt/user->id :crowberto)
              user-id  (mt/user->id :rasta)]
          (testing "request without user runs in default worktree"
            (is (= {:type :main} (run-middleware nil false nil))))
          (testing "header sent by admin names worktree request runs in"
            (is (= {:type :worktree :worktree-id worktree-id}
                   (run-middleware admin-id true (str worktree-id))))
            (is (= {:type :worktree :worktree-id other-worktree-id}
                   (run-middleware admin-id true (str other-worktree-id)))))
          (testing "header 0 names default worktree"
            (is (= {:type :main} (run-middleware admin-id true "0"))))
          (testing "header sent by non-admin is refused"
            (is (= 403 (run-middleware user-id false (str worktree-id))))
            (is (= 403 (run-middleware user-id false "0"))))
          (testing "header naming unknown worktree is refused"
            (is (= 400 (run-middleware admin-id true (str (+ other-worktree-id 1000)))))
            (is (= 400 (run-middleware admin-id true (str mdb/default-worktree-id)))))
          (testing "admin without checkout and without header works in default worktree"
            (is (= {:type :main} (run-middleware admin-id true nil))))
          (mt/with-temp [:model/RemoteSyncWorktreeUser _ {:user_id admin-id :worktree_id worktree-id}
                         :model/RemoteSyncWorktreeUser _ {:user_id user-id :worktree_id worktree-id}]
            (testing "admin works in worktree they checked out"
              (is (= {:type :worktree :worktree-id worktree-id} (run-middleware admin-id true nil))))
            (testing "header overrides admin's checkout"
              (is (= {:type :main} (run-middleware admin-id true "0"))))
            (testing "non-admin works in default worktree whatever they checked out"
              (is (= {:type :main} (run-middleware user-id false nil))))))))))
