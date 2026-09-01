(ns ^:mb/driver-tests metabase.driver.sql-jdbc.execute-test
  (:require
   [clojure.test :refer :all]
   [malli.error :as me]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.h2 :as h2]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.malli.registry :as mr])
  (:import
   (com.mchange.v2.c3p0 C3P0ProxyConnection ComboPooledDataSource)
   (java.sql Connection DatabaseMetaData DriverManager)
   (javax.sql DataSource)))

(deftest ^:parallel ConnectionOptions-test
  (are [options error] (= error
                          (me/humanize (mr/explain sql-jdbc.execute/ConnectionOptions options)))
    nil                              nil
    {}                               nil
    {:stream? true}                  nil
    {:session-timezone nil}          nil
    {:session-timezone "US/Pacific"} nil
    {:session-timezone "X"}          {:session-timezone ["invalid timezone ID: \"X\"" "timezone offset string literal"]}))

(set! *warn-on-reflection* true)

(deftest connection-reuse-test
  (testing "resilient context reuses reconnected connections"
    (mt/test-drivers (descendants driver/hierarchy :sql-jdbc)
      (let [test-db-id (mt/id)  ;; Get the test database ID
            connection-count (volatile! 0)
            orig-do-with-resolved-connection-data-source (mt/original-fn #'sql-jdbc.execute/do-with-resolved-connection-data-source)]
        (mt/with-dynamic-fn-redefs [sql-jdbc.execute/do-with-resolved-connection-data-source
                                    (fn [driver db opts]
                                      ;; Only count connections for our test database because on startup the audit-db will be
                                      ;; synced, which causes this to fail intermittently because it creates connections (to db
                                      ;; 13371337)
                                      (if (= db test-db-id)
                                        (reify javax.sql.DataSource
                                          (getConnection [_]
                                            (vswap! connection-count inc)
                                            (.getConnection ^DataSource (orig-do-with-resolved-connection-data-source driver db opts))))
                                        ;; For other databases (like audit DB), just pass through
                                        (orig-do-with-resolved-connection-data-source driver db opts)))]
          (let [closed-conn (doto (.getConnection ^DataSource
                                   (orig-do-with-resolved-connection-data-source driver/*driver* test-db-id {}))
                              (.close))]
            (driver/do-with-resilient-connection
             driver/*driver* test-db-id
             (fn [driver _]
               ;; reinit, as we it has been used for setup
               (vreset! connection-count 0)
               (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
               (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
               (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
               (is (= 1 @connection-count))
               (.close (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn))
               (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
               (is (= 2 @connection-count))))))))))

(deftest resilient-reconnect-preserves-connection-type-test
  (testing "resilient reconnection preserves *connection-type* binding"
    (mt/test-drivers (descendants driver/hierarchy :sql-jdbc)
      (let [test-db-id               (mt/id)
            captured-connection-type (volatile! nil)
            orig-fn                  (mt/original-fn #'sql-jdbc.execute/do-with-resolved-connection-data-source)]
        (mt/with-dynamic-fn-redefs [sql-jdbc.execute/do-with-resolved-connection-data-source
                                    (fn [driver db opts]
                                      (when (and (= db test-db-id) (:keep-open? opts))
                                        (vreset! captured-connection-type @#'driver.conn/*connection-type*))
                                      (orig-fn driver db opts))]
          (let [closed-conn (doto (.getConnection ^DataSource
                                   (orig-fn driver/*driver* test-db-id {}))
                              (.close))]
            (driver.conn/with-write-connection
              (driver/do-with-resilient-connection
               driver/*driver*
               test-db-id
               (fn [driver _]
                 (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
                 (is (= :write-data @captured-connection-type)
                     "Reconnection should preserve write-data connection type"))))))))))

(deftest try-ensure-open-conn-sets-non-recursive-options-test
  (testing "try-ensure-open-conn! sets connection options as non-recursive"
    ;; [kondo-keep] suppresses a warning :redundant-ignore can't see; --audit rechecks
    #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
    (mt/test-drivers (disj (descendants driver/hierarchy :sql-jdbc)
                           ;; too tricky to stub the connection
                           :presto-jdbc :databricks :starburst :clickhouse)
      (let [connection-option-calls (volatile! [])
            is-default-options
            (identical? (get-method sql-jdbc.execute/do-with-connection-with-options :sql-jdbc)
                        (get-method sql-jdbc.execute/do-with-connection-with-options driver/*driver*))

            orig-do-with-resolved-connection-data-source @#'sql-jdbc.execute/do-with-resolved-connection-data-source
            closed-conn (proxy [Connection] []
                          (isClosed [] true)
                          (close [] nil))

            new-conn (proxy [Connection] []
                       (isClosed [] false)
                       (close [] nil)
                       (isReadOnly [] true)
                       (getMetaData []
                         (reify DatabaseMetaData
                           (supportsTransactionIsolationLevel [_ _] false)))
                       (createStatement []
                         (reify java.sql.Statement
                           (execute [_ _] true)
                           (close [_] nil)))
                       (setReadOnly [read-only]
                         (vswap! connection-option-calls conj [:setReadOnly read-only]))
                       (setAutoCommit [auto-commit]
                         (vswap! connection-option-calls conj [:setAutoCommit auto-commit]))
                       (setTransactionIsolation [level]
                         (vswap! connection-option-calls conj [:setTransactionIsolation level]))
                       (setHoldability [holdability]
                         (vswap! connection-option-calls conj [:setHoldability holdability]))
                       (setNetworkTimeout [executor timeout-ms]
                         (vswap! connection-option-calls conj [:setNetworkTimeout timeout-ms])))]
        (with-redefs [sql-jdbc.execute/do-with-resolved-connection-data-source
                      (fn [driver db options]
                        (if (:keep-open? options)
                          (reify javax.sql.DataSource
                            (getConnection [_] new-conn))
                          (orig-do-with-resolved-connection-data-source driver db options)))

                      sql-jdbc.execute/recursive-connection?
                      (let [original-recursive-fn sql-jdbc.execute/recursive-connection?]
                        (fn []
                          (let [ret (original-recursive-fn)]
                            (vswap! connection-option-calls conj [:recursive-connection-check ret])
                            ret)))]
          (driver/do-with-resilient-connection
           driver/*driver* (mt/id)
           (fn [driver _db]
             (let [result (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)]
               ;; Should return the new connection
               (is (identical? new-conn result))
               (is (some #(= % [:recursive-connection-check false]) @connection-option-calls))
               ;; Should have set connection options (since it's non-recursive)
               (when is-default-options
                 (let [calls @connection-option-calls]
                   (is (some #(= [:setReadOnly true] %) calls))
                   (is (some #(= [:setAutoCommit true] %) calls))
                   (is (some #(= (first %) :setHoldability) calls))
                   (is (some #(= (first %) :setNetworkTimeout) calls))))))))))))

(deftest is-conn-open-test
  (testing "is-conn-open with valid check"
    (testing "returns true when connection is open and valid"
      (let [conn (reify Connection
                   (isClosed [_] false)
                   (isValid [_ _] true))]
        (is (true? (sql-jdbc.execute/is-conn-open? conn :check-valid? true)))))
    (testing "returns false when connection is closed"
      (let [conn (reify Connection
                   (isClosed [_] true)
                   (isValid [_ _] true))]
        (is (false? (sql-jdbc.execute/is-conn-open? conn :check-valid? true)))))
    (testing "closes connection and returns false when connection is open but not valid"
      (let [close-called? (atom false)
            conn (reify Connection
                   (isClosed [_] @close-called?)
                   (isValid [_ _] false)
                   (close [_] (reset! close-called? true)))]
        (is (false? (sql-jdbc.execute/is-conn-open? conn :check-valid? true)))
        (is (true? @close-called?) "Connection should be closed when invalid")
        (is (true? (.isClosed conn)))))))

(deftest statement-is-closed-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    (testing "can check isClosed on statement"
      (when (driver/database-supports? driver/*driver* :jdbc/statements nil)
        (sql-jdbc.execute/do-with-connection-with-options
         driver/*driver* (mt/id) nil
         (fn [^Connection conn]
           (let [stmt (sql-jdbc.execute/statement driver/*driver* conn)]
             (is (false? (.isClosed stmt)))
             (.close stmt)
             (is (true? (.isClosed stmt))))))))
    (testing "can check isClosed on prepared statement"
      (sql-jdbc.execute/do-with-connection-with-options
       driver/*driver* (mt/id) nil
       (fn [^Connection conn]
         (let [prepared-stmt (sql-jdbc.execute/prepared-statement driver/*driver* conn "select 1" [])]
           (is (false? (.isClosed prepared-stmt)))
           (.close prepared-stmt)
           (is (true? (.isClosed prepared-stmt)))))))))

(deftest write-op-metric-test
  (testing "write-op counter tracks default connection acquisitions"
    (mt/with-prometheus-system! [_ system]
      (mt/test-drivers (descendants driver/hierarchy :sql-jdbc)
        (sql-jdbc.execute/do-with-connection-with-options
         driver/*driver* (mt/id) nil
         (fn [_conn] nil))
        (is (pos? (mt/metric-value system :metabase-db-connection/write-op
                                   {:connection-type "default"}))))))
  (when config/ee-available?
    (testing "write-op counter tracks write-data connection acquisitions"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-prometheus-system! [_ system]
          (mt/test-drivers (descendants driver/hierarchy :sql-jdbc)
            (let [db (mt/db)]
              (mt/with-temp-vals-in-db :model/Database (:id db) {:write_data_details (:details db)}
                (driver.conn/with-write-connection
                  (sql-jdbc.execute/do-with-connection-with-options
                   driver/*driver* (mt/id) nil
                   (fn [_conn] nil)))
                (is (pos? (mt/metric-value system :metabase-db-connection/write-op
                                           {:connection-type "write-data"})))))))))))

(deftest bad-connection-details-throw-client-error-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    ;; needs a real Database row: the query goes through the HTTP API, not a metadata provider
    #_{:clj-kondo/ignore [:discouraged-var]}
    (mt/with-temp [:model/Database tmp-db {:details (tx/bad-connection-details driver/*driver*)
                                           :engine  driver/*driver*}]
      ;; It's not straightforward to trigger a `.getConnection` error for some drivers (e.g. sqlite)
      ;; so just mock the exception. Also need to mock this h2 method so that the query doesn't fail
      ;; before it gets to `do-with-resolved-connection-data-source`.
      (with-redefs [h2/check-read-only-statements (fn [_query] nil)
                    sql-jdbc.execute/do-with-resolved-connection-data-source
                    (fn [_driver _db-or-id-or-spec _options]
                      (reify javax.sql.DataSource
                        (getConnection [_]
                          (throw (java.sql.SQLException. "connection error")))))]
        (let [query    {:database (:id tmp-db)
                        :type     :native
                        :native   {:query "SELECT 1"}}
              response (mt/user-http-request :crowberto :post 400 "dataset" query)]
          (is (= "unable-to-acquire-connection" (:error_type response))))))))

(deftest connection-pool-checkout-timeout-returns-503-test
  (testing "A c3p0 checkout timeout (saturated pool) surfaces to the frontend as a retriable HTTP 503"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      ;; needs a real Database row: the query goes through the HTTP API, not a metadata provider
      #_{:clj-kondo/ignore [:discouraged-var]}
      (mt/with-temp [:model/Database tmp-db {:details (tx/bad-connection-details driver/*driver*)
                                             :engine  driver/*driver*}]
        (with-redefs [h2/check-read-only-statements (fn [_query] nil)
                      sql-jdbc.execute/do-with-resolved-connection-data-source
                      (fn [_driver _db-or-id-or-spec _options]
                        (reify javax.sql.DataSource
                          (getConnection [_]
                            (throw (java.sql.SQLException.
                                    "An attempt by a client to checkout a Connection has timed out."
                                    (com.mchange.v2.resourcepool.TimeoutException. "timed out"))))))]
          (let [query    {:database (:id tmp-db)
                          :type     :native
                          :native   {:query "SELECT 1"}}
                response (mt/user-http-request :crowberto :post 503 "dataset" query)]
            (is (= "connection-pool-checkout-timeout" (:error_type response)))))))))

(deftest checkout-queue-full?-test
  (let [full? #'sql-jdbc.execute/checkout-queue-full?]
    (testing "a limit of 0 (the default) disables the check even when many queries are waiting"
      (mt/with-temporary-setting-values [jdbc-data-warehouse-connection-pool-max-pending-checkouts 0]
        (is (false? (full? (reify com.mchange.v2.c3p0.PooledDataSource
                             (getNumThreadsAwaitingCheckoutDefaultUser [_] 100)))))))
    (testing "non-pooled data sources are never considered full"
      (mt/with-temporary-setting-values [jdbc-data-warehouse-connection-pool-max-pending-checkouts 1]
        (is (false? (full? (reify javax.sql.DataSource
                             (getConnection [_] nil)))))))
    (testing "full only once the waiting count reaches the limit"
      (mt/with-temporary-setting-values [jdbc-data-warehouse-connection-pool-max-pending-checkouts 3]
        (is (false? (full? (reify com.mchange.v2.c3p0.PooledDataSource
                             (getNumThreadsAwaitingCheckoutDefaultUser [_] 2)))))
        (is (true? (full? (reify com.mchange.v2.c3p0.PooledDataSource
                            (getNumThreadsAwaitingCheckoutDefaultUser [_] 3)))))))))

(deftest connection-pool-full-checkout-queue-returns-503-test
  (testing "When the checkout queue is full, additional queries fail fast with a retriable HTTP 503"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      ;; needs a real Database row: the query goes through the HTTP API, not a metadata provider
      #_{:clj-kondo/ignore [:discouraged-var]}
      (mt/with-temp [:model/Database tmp-db {:details (tx/bad-connection-details driver/*driver*)
                                             :engine  driver/*driver*}]
        (mt/with-temporary-setting-values [jdbc-data-warehouse-connection-pool-max-pending-checkouts 1]
          (with-redefs [h2/check-read-only-statements (fn [_query] nil)
                        sql-jdbc.execute/do-with-resolved-connection-data-source
                        (fn [_driver _db-or-id-or-spec _options]
                          ;; a pool that already has more queries waiting than the configured max
                          (reify com.mchange.v2.c3p0.PooledDataSource
                            (getNumThreadsAwaitingCheckoutDefaultUser [_] 5)))]
            (let [query    {:database (:id tmp-db)
                            :type     :native
                            :native   {:query "SELECT 1"}}
                  response (mt/user-http-request :crowberto :post 503 "dataset" query)]
              (is (= "connection-pool-checkout-queue-full" (:error_type response))))))))))

(defn- venues-rows
  "Run an unaggregated venues query limited to `n` rows."
  [n]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/limit n)
        qp/process-query
        mt/rows)))

(deftest cancel-statement-only-when-rows-remain-test
  (testing "the statement is canceled only when reduction stopped before the ResultSet ran out of rows"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      ;; take the dataset creation and sync queries before anything is counted
      (venues-rows 1)
      (let [cancels (atom 0)]
        ;; returning false keeps the cancelation from discarding the pooled connection, which is asserted separately
        (mt/with-dynamic-fn-redefs [sql-jdbc.execute/cancel-statement! (fn [_driver _stmt]
                                                                         (swap! cancels inc)
                                                                         false)]
          (testing "rows ran out, so there is nothing left to cancel"
            (reset! cancels 0)
            (is (= 100 (count (venues-rows 1000))))
            (is (zero? @cancels)))
          (testing "reduction stopped at the row limit while the statement was still producing (#39018)"
            (reset! cancels 0)
            (is (= 4 (count (venues-rows 4))))
            (is (pos? @cancels))))))))

(def ^:private raw-connection-to-string-method
  (.getMethod Object "toString" (make-array Class 0)))

(defn- raw-connection-identity
  "Identify the physical Connection behind a c3p0 proxy, to tell a recycled connection from a freshly acquired one."
  [^C3P0ProxyConnection conn]
  (.rawConnectionOperation conn
                           raw-connection-to-string-method
                           C3P0ProxyConnection/RAW_CONNECTION
                           (make-array Object 0)))

(deftest discard-pooled-connection-test
  (testing "discarding closes the physical Connection, so c3p0 destroys it at check-in rather than recycling it"
    (with-open [ds (doto (ComboPooledDataSource.)
                     (.setJdbcUrl "jdbc:h2:mem:discard-pooled-connection-test;DB_CLOSE_DELAY=-1")
                     (.setInitialPoolSize 1)
                     (.setMinPoolSize 1)
                     (.setMaxPoolSize 1))]
      (letfn [(checked-out-identity []
                (with-open [conn (.getConnection ds)]
                  (raw-connection-identity conn)))]
        (let [before (checked-out-identity)]
          (testing "a plain check-in/check-out cycle hands back the same physical Connection"
            (is (= before (checked-out-identity))))
          (with-open [conn (.getConnection ds)]
            (#'sql-jdbc.execute/discard-pooled-connection! conn))
          (testing "after discarding, the next checkout is a different physical Connection"
            (is (not= before (checked-out-identity)))))))))

(deftest discard-pooled-connection-leaves-unpooled-connection-alone-test
  (testing "a Connection with no pool behind it has no next query to poison, so it is left open"
    (with-open [conn (DriverManager/getConnection "jdbc:h2:mem:discard-unpooled-test;DB_CLOSE_DELAY=-1")]
      (#'sql-jdbc.execute/discard-pooled-connection! conn)
      (is (not (.isClosed conn))))))

(deftest discarded-connection-does-not-break-the-query-that-discarded-it-test
  (testing "the ResultSet and Statement still close cleanly after their Connection has been discarded"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      ;; stopping at the limit leaves the statement producing, which is what triggers the cancel-and-discard
      (is (= 4 (count (venues-rows 4))))
      (testing "and the pool replaces it, so the next query still runs"
        (is (= 4 (count (venues-rows 4))))))))
