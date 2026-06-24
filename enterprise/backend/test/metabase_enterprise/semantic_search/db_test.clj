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

(def ^:private parse-db-url #'semantic.db.datasource/parse-db-url)

(def ^:private base-url "jdbc:postgresql://localhost:5432/mb_semantic_search")

(deftest parse-db-url-defaults-test
  (testing "a URL with no params leaves the URL untouched and uses the default pool props"
    (is (=? {:jdbc-url   base-url
             :pool-props {"maxPoolSize"              5
                          "minPoolSize"              0
                          "testConnectionOnCheckout" false}}
            (parse-db-url base-url)))))

(deftest parse-db-url-pool-knob-test
  (testing "a recognized pool knob is pulled off the URL, parsed, and merged over the defaults"
    (is (=? {:jdbc-url   base-url
             :pool-props {"maxPoolSize" 12}}
            (parse-db-url (str base-url "?maxPoolSize=12")))))
  (testing "a boolean knob coerces case-insensitively"
    (is (=? {:pool-props {"testConnectionOnCheckout" true}}
            (parse-db-url (str base-url "?testConnectionOnCheckout=TRUE"))))))

(deftest parse-db-url-connection-param-test
  (testing "a recognized Postgres connection param stays on the URL for pgjdbc"
    (is (=? {:jdbc-url (str base-url "?tcpKeepAlive=true")}
            (parse-db-url (str base-url "?tcpKeepAlive=true")))))
  (testing "pool knobs are stripped while connection params + credentials are retained, in order"
    (is (=? {:jdbc-url   (str base-url "?user=postgres&tcpKeepAlive=true")
             :pool-props {"maxPoolSize" 8}}
            (parse-db-url (str base-url "?user=postgres&maxPoolSize=8&tcpKeepAlive=true"))))))

(deftest parse-db-url-validation-test
  (testing "an unrecognized param throws rather than being silently ignored by pgjdbc"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Unknown pgvector URL parameter maxPoolSizee"
         (parse-db-url (str base-url "?maxPoolSizee=5")))))
  (testing "a malformed pool-knob value throws"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid value for pgvector pool parameter maxPoolSize"
         (parse-db-url (str base-url "?maxPoolSize=lots"))))))
