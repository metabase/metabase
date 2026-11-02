(ns metabase.search.appdb.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.events.audit-log]
   [metabase.events.core :as events]
   [metabase.search.appdb.core]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.db :as search.db]
   [metabase.search.engine :as search.engine]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment metabase.audit-app.events.audit-log/keep-me)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- search-with-tracking!
  "Search the appdb index with the tracking state `tracked`, where a sync of the tracking state finds `synced`.
  Returns the results, or the exception that the search throws."
  [tracked synced]
  (mt/with-dynamic-fn-redefs [search.index/sync-tracking-atoms! (fn [] (reset! @#'search.index/*indexes* synced))]
    (reset! @#'search.index/*indexes* tracked)
    (try
      (vec (search.tu/search-results "orders" {:search-engine "appdb"}))
      (catch Exception e
        e))))

(deftest results-sync-the-tracking-state-test
  (search.tu/with-temp-index-table
    (let [table (search.index/active-table)
          gone  :search_index__gone]
      (testing "an index that a sync finds serves the query"
        (is (vector? (search-with-tracking! {:active nil} {:active table}))))
      (testing "when the tracked table is gone, the index that a sync finds serves the query"
        (is (vector? (search-with-tracking! {:active gone} {:active table}))))
      (testing "with no index after a sync, the search says that the index is not found"
        (let [e (search-with-tracking! {:active nil} {})]
          (is (search/index-not-found? e))
          (is (nil? (ex-cause e)))))
      (testing "when the tracked table is gone and a sync finds no index, the query failure is the cause"
        (let [e (search-with-tracking! {:active gone} {})]
          (is (search/index-not-found? e))
          (is (some? (ex-cause e)))))
      (testing "when the tracked table exists, a failed query is rethrown unchanged, even if a sync finds no index"
        (mt/with-dynamic-fn-redefs [search.db/scored-search-rows (fn [& _] (throw (ex-info "Boom" {})))]
          (let [e (search-with-tracking! {:active table} {})]
            (is (= "Boom" (ex-message e)))
            (is (not (search/index-not-found? e)))))))))

(deftest locale-change-reindexes-after-commit-test
  (when (= :postgres (mdb/db-type))
    (let [reindex-connectable (promise)]
      (with-redefs [search.engine/reindex! (fn [& _] (deliver reindex-connectable t2.conn/*current-connectable*))]
        (t2/with-transaction [_conn]
          (events/publish-event! :event/setting-update {:details {:key :site-locale}})
          (is (not (realized? reindex-connectable))))
        (is (nil? (deref reindex-connectable 5000 ::timed-out)))))))

(deftest locale-change-rebuilds-the-index-in-the-new-language-test
  (when (= :postgres (mdb/db-type))
    (search.tu/with-temp-index-table
      (mt/with-temp [:model/Card _ {:name "Häuser"}]
        (search.engine/reindex! :search.engine/appdb {:in-place? true})
        (let [english-index (search.index/active-table)]
          (is (empty? (search.index/search "haus")))
          (mt/with-temporary-setting-values [site-locale "de"]
            (is (not= english-index (search.index/active-table)))
            (is (= [["card" "Häuser"]] (search.index/search "haus")))))))))
