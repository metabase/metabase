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
    ;; strict = (not =?) so an unexpected extra/missing prop also fails, not just a wrong value
    (is (= {:jdbc-url   base-url
            :pool-props {;; tunable knobs at their defaults
                         "maxPoolSize"                          5
                         "minPoolSize"                          0
                         "initialPoolSize"                      0
                         "checkoutTimeout"                      10000
                         "unreturnedConnectionTimeout"          0
                         "debugUnreturnedConnectionStackTraces" false
                         "testConnectionOnCheckout"             false
                         ;; fixed props operators can't override
                         "idleConnectionTestPeriod"             60
                         "maxIdleTimeExcessConnections"         600
                         "maxConnectionAge"                     1800
                         "acquireIncrement"                     1
                         "dataSourceName"                       "metabase-semantic-search-db"}}
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

(deftest pool-props-applied-by-c3p0-test
  (testing "c3p0 actually understands and applies every pool property name we set"
    ;; We hand c3p0 a Properties map; like pgjdbc, c3p0 silently ignores names it doesn't recognize, so a
    ;; typo in our prop map would quietly fall back to a c3p0 default. Read the effective config back from
    ;; the pool to prove each name took effect. The values below all differ from c3p0's own defaults, so a
    ;; dropped property would surface as a mismatch.
    (when semantic.db.datasource/db-url
      (let [url (str semantic.db.datasource/db-url
                     "&minPoolSize=2"
                     "&initialPoolSize=2"
                     "&maxPoolSize=9"
                     "&checkoutTimeout=4321"
                     "&unreturnedConnectionTimeout=77"
                     "&debugUnreturnedConnectionStackTraces=true"
                     "&testConnectionOnCheckout=true")]
        (with-redefs [semantic.db.datasource/db-url      url
                      semantic.db.datasource/data-source (atom nil)]
          (try
            (semantic.db.datasource/init-db!)
            (let [pool-ds ^PoolBackedDataSource @semantic.db.datasource/data-source
                  cpds    (.getConnectionPoolDataSource pool-ds)]
              (is (=? {;; tunable knobs supplied on the URL
                       :maxPoolSize                          9
                       :minPoolSize                          2
                       :initialPoolSize                      2
                       :checkoutTimeout                      4321
                       :unreturnedConnectionTimeout          77
                       :debugUnreturnedConnectionStackTraces true
                       :testConnectionOnCheckout             true
                       ;; fixed props we always set, on the connection-pool DS
                       :idleConnectionTestPeriod             60
                       :maxIdleTimeExcessConnections         600
                       :maxConnectionAge                     1800
                       :acquireIncrement                     1}
                      (bean cpds)))
              ;; dataSourceName is the one fixed prop that lives on the outer pooled DS, not the cpds
              (is (= "metabase-semantic-search-db" (.getDataSourceName pool-ds))))
            (finally
              (semantic.db.datasource/shutdown-db!))))))))
