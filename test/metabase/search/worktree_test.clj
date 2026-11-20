(ns metabase.search.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.impl :as search.impl]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]))

(def ^:private worktree-scope
  {:type :worktree :worktree-id 1})

(deftest worktree-search-engine-test
  (mt/with-dynamic-fn-redefs [search.engine/default-engine (constantly :search.engine/appdb)]
    (testing "main app searches with default engine"
      (is (= :search.engine/appdb (#'search.impl/parse-engine nil))))
    (testing "worktree searches in place, whatever engine is asked for"
      (mdb/with-worktree-scope worktree-scope
        (is (= :search.engine/in-place (#'search.impl/parse-engine nil)))
        (is (= :search.engine/in-place (#'search.impl/parse-engine "appdb")))))))

(deftest worktree-ingestion-test
  (let [ingested (atom 0)]
    (mt/with-dynamic-fn-redefs [search.ingestion/bulk-ingest! (fn [_updates] (swap! ingested inc))]
      (testing "writes in worktree index nothing"
        (mdb/with-worktree-scope worktree-scope
          (search.ingestion/ingest-maybe-async! [["card" [:= :this.id 1]]] true))
        (is (zero? @ingested)))
      (testing "writes in main app are indexed"
        (search.ingestion/ingest-maybe-async! [["card" [:= :this.id 1]]] true)
        (is (= 1 @ingested))))))

(deftest worktree-reindex-test
  (testing "reindex started in worktree indexes main app's rows"
    (let [scope (atom nil)]
      (mt/with-dynamic-fn-redefs [search/reindex-logic! (fn [_opts] (reset! scope mdb.worktree/*scope*))]
        (mdb/with-worktree-scope worktree-scope
          @(search/reindex! :async? false))
        (is (= {:type :main} @scope))))))
