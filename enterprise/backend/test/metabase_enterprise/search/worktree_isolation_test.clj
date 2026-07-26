(ns metabase-enterprise.search.worktree-isolation-test
  "Remote-sync WORKTREE isolation coverage for the appdb-indexed search engine: `GET /api/search` must return
  only content matching the caller's worktree, enforced in SQL via
  `metabase.search.permissions/worktree-visibility-clause` rather than relying on the per-row `can-read?`
  post-filter (which the in-place engine leans on instead)."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- search-names [response]
  (into #{} (map :name) (:data response)))

(deftest search-worktree-isolation-test
  (search.tu/with-appdb-search-if-available-without-fallback
    (mt/with-full-data-perms-for-all-users!
      (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}
                     :model/User               wt-user {:worktree_id (:id wt)}]
        (let [search-name (str "worktree-isolation-" (random-uuid))]
          (mt/with-temp [:model/Card _main-card {:name search-name}]
            (binding [api/*current-worktree-id* (:id wt)]
              (mt/with-temp [:model/Card _wt-card {:name search-name}]
                (testing "a main user only sees the main-scope card"
                  (let [names (search-names (mt/user-http-request :crowberto :get 200 "search" :q search-name))]
                    (is (= #{search-name} names))))
                (testing "a worktree user only sees their own worktree's card"
                  (let [names (search-names (mt/user-http-request wt-user :get 200 "search" :q search-name))]
                    (is (= #{search-name} names))))))))))))
