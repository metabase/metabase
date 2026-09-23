(ns metabase-enterprise.semantic-search.sqlite-engine-test
  "The SQLite store wired in as the semantic search engine (PLAN_002)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.sqlite-config :as sqlite-config]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.search.engine :as search.engine]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest gating-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-dynamic-fn-redefs [semantic.embedding/embedding-supported? (constantly true)]
      (testing "SQLite mode: semantic is supported without pgvector, and every pgvector gate is off"
        (mt/with-dynamic-fn-redefs [sqlite-config/db-path (constantly "/tmp/unused-sqlite-store.db")]
          (is (search.engine/supported-engine? :search.engine/semantic))
          (is (= :search.engine/semantic (first (search.engine/supported-engines))))
          (is (false? (semantic.util/semantic-search-configured?)))
          (is (false? (semantic.util/semantic-search-available?)))))
      (testing "without the store, support still depends on pgvector as before"
        (mt/with-dynamic-fn-redefs [sqlite-config/db-path (constantly nil)]
          (is (= (semantic.util/semantic-search-available?)
                 (search.engine/supported-engine? :search.engine/semantic))))))))
