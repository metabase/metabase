(ns metabase-enterprise.semantic-search.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource])
  (:import
   (com.mchange.v2.c3p0 PoolBackedDataSource)))

(set! *warn-on-reflection* true)

(deftest connection-pool-initialization-test
  (testing "Connection pool can be initialized and tested"
    (when semantic.db.datasource/db-url
      ;; Reset the data source to ensure clean test
      (reset! semantic.db.datasource/data-source nil)

      (testing "Data source is nil before initialization"
        (is (nil? @semantic.db.datasource/data-source)))

      (testing "init-db! creates a pooled data source"
        (semantic.db.datasource/init-db!)
        (is (some? @semantic.db.datasource/data-source))
        (is (instance? PoolBackedDataSource @semantic.db.datasource/data-source)))

      (testing "test-connection! works with pooled connection"
        (let [result (semantic.db.datasource/test-connection!)]
          (is (= {:test 1} result))))

      (testing "Connection pool properties are configured correctly"
        (when (instance? PoolBackedDataSource @semantic.db.datasource/data-source)
          (let [pool ^PoolBackedDataSource @semantic.db.datasource/data-source]
            ;; Test that pool is properly configured
            (is (<= (.getNumConnections pool) 5))
            (is (>= (.getNumConnections pool) 0))))))))

(deftest db-url-validation-test
  (testing "init-db! throws exception when DB URL is missing"
    (with-redefs [semantic.db.datasource/db-url nil
                  semantic.db.datasource/data-source (atom nil)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"MB_PGVECTOR_DB_URL environment variable is required"
           (semantic.db.datasource/init-db!))))))

(deftest test-connection-before-init-test
  (testing "test-connection! throws exception when pool not initialized"
    (let [orig-data-source @semantic.db.datasource/data-source]
      (try
        (reset! semantic.db.datasource/data-source nil)
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Semantic search connection pool is not initialized"
             (semantic.db.datasource/test-connection!)))
        (finally
          (reset! semantic.db.datasource/data-source orig-data-source))))))
