(ns metabase-enterprise.semantic-search.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db :as semantic.db])
  (:import
   (com.mchange.v2.c3p0 PoolBackedDataSource)))

(set! *warn-on-reflection* true)

(deftest connection-pool-initialization-test
  (testing "Connection pool can be initialized and tested"
    (when semantic.db/db-url
      ;; Reset the data source to ensure clean test
      (reset! semantic.db/data-source nil)

      (testing "Data source is nil before initialization"
        (is (nil? @semantic.db/data-source)))

      (testing "init-db! creates a pooled data source"
        (semantic.db/init-db!)
        (is (some? @semantic.db/data-source))
        (is (instance? PoolBackedDataSource @semantic.db/data-source)))

      (testing "test-connection! works with pooled connection"
        (let [result (semantic.db/test-connection!)]
          (is (= {:test 1} result))))

      (testing "Connection pool properties are configured correctly"
        (when (instance? PoolBackedDataSource @semantic.db/data-source)
          (let [pool ^PoolBackedDataSource @semantic.db/data-source]
            ;; Test that pool is properly configured
            (is (<= (.getNumConnections pool) 5))
            (is (>= (.getNumConnections pool) 0))))))))

(deftest db-url-validation-test
  (testing "init-db! throws exception when DB URL is missing"
    (with-redefs [semantic.db/db-url nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"MB_PGVECTOR_DB_URL environment variable is required"
           (semantic.db/init-db!))))))

(deftest test-connection-before-init-test
  (testing "test-connection! throws exception when pool not initialized"
    (reset! semantic.db/data-source nil)
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Semantic search connection pool is not initialized"
         (semantic.db/test-connection!)))))
