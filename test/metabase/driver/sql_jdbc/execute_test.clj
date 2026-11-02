(ns ^:mb/driver-tests metabase.driver.sql-jdbc.execute-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [malli.error :as me]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.h2 :as h2]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.sql Connection DatabaseMetaData ResultSet SQLException SQLNonTransientConnectionException SQLRecoverableException
             SQLTimeoutException SQLTransientConnectionException)
   (javax.sql DataSource)
   (org.sqlite SQLiteErrorCode SQLiteException)))

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

            orig-do-with-resolved-connection-data-source (mt/original-fn #'sql-jdbc.execute/do-with-resolved-connection-data-source)
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
        (mt/with-dynamic-fn-redefs [sql-jdbc.execute/do-with-resolved-connection-data-source
                                    (fn [driver db options]
                                      (if (:keep-open? options)
                                        (reify javax.sql.DataSource
                                          (getConnection [_] new-conn))
                                        (orig-do-with-resolved-connection-data-source driver db options)))
                                    sql-jdbc.execute/recursive-connection?
                                    (let [original-recursive-fn (mt/original-fn #'sql-jdbc.execute/recursive-connection?)]
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
      (mt/with-dynamic-fn-redefs [h2/check-read-only-statements (fn [_query] nil)
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
        (mt/with-dynamic-fn-redefs [h2/check-read-only-statements (fn [_query] nil)
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

(deftest failed-checkout-destroys-empty-pool-test
  (testing "When a checkout fails, do-with-resolved-connection destroys the pool only if the pool has no Connections"
    (doseq [[num-connections destroyed?] [[0 true] [1 false]]]
      (let [db-id       Integer/MAX_VALUE
            cache-key   [db-id :default]
            data-source (reify com.mchange.v2.c3p0.PooledDataSource
                          (getConnection [_]
                            (throw (java.sql.SQLException. "password authentication failed")))
                          (getNumConnectionsDefaultUser [_] num-connections))
            pool-spec   {:datasource data-source}
            destroyed   (atom [])
            pool-cache  @#'sql-jdbc.conn/pool-cache-key->connection-pool]
        (swap! pool-cache assoc cache-key pool-spec)
        (try
          (mt/with-dynamic-fn-redefs [sql-jdbc.execute/do-with-resolved-connection-data-source
                                      (fn [_driver _db-or-id-or-spec _options] data-source)
                                      sql-jdbc.conn/destroy-pool!
                                      (fn [id spec] (swap! destroyed conj [id spec]))]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Unable to connect to the database"
                 (sql-jdbc.execute/do-with-resolved-connection :h2 db-id {} (fn [_conn] nil))))
            (is (= (if destroyed? [[db-id pool-spec]] [])
                   @destroyed))
            (is (= (not destroyed?)
                   (contains? @pool-cache cache-key))))
          (finally
            (swap! pool-cache dissoc cache-key)))))))

(deftest connection-pool-full-checkout-queue-returns-503-test
  (testing "When the checkout queue is full, additional queries fail fast with a retriable HTTP 503"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      ;; needs a real Database row: the query goes through the HTTP API, not a metadata provider
      #_{:clj-kondo/ignore [:discouraged-var]}
      (mt/with-temp [:model/Database tmp-db {:details (tx/bad-connection-details driver/*driver*)
                                             :engine  driver/*driver*}]
        (mt/with-temporary-setting-values [jdbc-data-warehouse-connection-pool-max-pending-checkouts 1]
          (mt/with-dynamic-fn-redefs [h2/check-read-only-statements (fn [_query] nil)
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

(defn- venues-query
  "An unaggregated query of all 100 venues."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- venues-count-by-id
  "A query that counts venues per id: 100 rows, aggregated, so the QP adds no SQL limit."
  []
  (let [mp (mt/metadata-provider)]
    (-> (venues-query)
        (lib/aggregate (lib/count))
        (lib/breakout (lib.metadata/field mp (mt/id :venues :id))))))

(defn- row-count
  "Run `query` and return how many rows it returned."
  [query]
  (-> query qp/process-query mt/rows count))

(deftest cancel-statement-only-when-rows-remain-test
  (testing "the statement is canceled only when reduction stopped before the ResultSet ran out of rows"
    (mt/test-drivers (mt/normal-driver-select
                      {:+parent :sql-jdbc
                       :-fns    [#'sql-jdbc.execute/drivers-exempt-from-cancelation]})
      ;; take the dataset creation and sync queries before anything is counted
      (row-count (lib/limit (venues-query) 1))
      (let [cancels (atom 0)
            cancel! (mt/original-fn #'sql-jdbc.execute/cancel-statement!)
            run     (fn [query]
                      (reset! cancels 0)
                      (row-count query))]
        ;; count each call, then do the real cancel, so that a driver still discards a canceled connection
        (mt/with-dynamic-fn-redefs [sql-jdbc.execute/cancel-statement! (fn [driver stmt]
                                                                         (swap! cancels inc)
                                                                         (cancel! driver stmt))]
          (testing "rows ran out, so there is nothing left to cancel"
            (is (= 100 (run (lib/limit (venues-query) 1000))))
            (is (zero? @cancels)))
          (testing "reduction read exactly the SQL limit, so the server has no rows left"
            (is (= 4 (run (lib/limit (venues-query) 4))))
            (is (zero? @cancels)))
          (testing "reduction read exactly the page items, so the server has no rows left"
            (is (= 4 (run (lib/with-page (venues-query) {:page 1 :items 4}))))
            (is (zero? @cancels)))
          (testing "a cap below the SQL limit leaves the statement producing (#39018)"
            (is (= 4 (run (-> (lib/limit (venues-query) 10)
                              (assoc :constraints {:max-results-bare-rows 4})))))
            (is (= 1 @cancels)))
          (testing "an aggregated query has no SQL limit, so a cap leaves the statement producing"
            (is (= 4 (run (assoc (venues-count-by-id) :constraints {:max-results 4}))))
            (is (= 1 @cancels))))))))

(defn- rff-canceling-at-row!
  "The default rff, which also cancels the query through [[qp.pipeline/*canceled-chan*]] when it gets row `n`."
  [n]
  (fn [metadata]
    (let [rf        (qp.reducible/default-rff metadata)
          rows-seen (volatile! 0)]
      (fn
        ([] (rf))
        ([acc] (rf acc))
        ([acc row]
         (when (= n (vswap! rows-seen inc))
           (a/offer! qp.pipeline/*canceled-chan* ::canceled))
         (rf acc row))))))

(defn- do-with-poisoning-cancelation
  "Call `thunk` while [[sql-jdbc.execute/cancelation-poisons-connection?]] returns true for `driver`."
  [driver thunk]
  (assert (= (get-method sql-jdbc.execute/cancelation-poisons-connection? :default)
             (get-method sql-jdbc.execute/cancelation-poisons-connection? driver))
          "the driver must use the default method, so that removing the test method restores it")
  (defmethod sql-jdbc.execute/cancelation-poisons-connection? driver [_driver] true)
  (try
    (thunk)
    (finally
      (remove-method sql-jdbc.execute/cancelation-poisons-connection? driver))))

(deftest discard-connection-after-canceled-chan-fires-test
  (testing "a QP cancel that arrives after the reduce read exactly the SQL limit still discards a poisoned Connection"
    (mt/test-driver :h2
      ;; take the dataset creation and sync queries before anything is counted
      (row-count (lib/limit (venues-query) 1))
      (let [discards (atom 0)
            discard! (mt/original-fn #'sql-jdbc.conn/discard-pooled-connection!)
            run      (fn [query rff]
                       (reset! discards 0)
                       (-> (qp/process-query query rff) mt/rows count))]
        (do-with-poisoning-cancelation
         :h2
         (fn []
           (mt/with-dynamic-fn-redefs [sql-jdbc.conn/discard-pooled-connection! (fn [conn]
                                                                                  (swap! discards inc)
                                                                                  (discard! conn))]
             (testing "with no cancel, the Connection goes back to the pool"
               (is (= 4 (run (lib/limit (venues-query) 4) nil)))
               (is (zero? @discards)))
             ;; the reduce stops at row 4 before it polls the channel again, so only the canceled chan shows the cancel
             (testing "the canceled chan fired at the last row"
               (is (= 4 (run (lib/limit (venues-query) 4) (rff-canceling-at-row! 4))))
               (is (= 1 @discards))))))))))

(deftest statement-max-rows-test
  (testing "the statement cap is one above a SQL limit that equals it, so that the server can finish the query"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      (let [max-rows (atom nil)
            execute! (mt/original-fn #'sql-jdbc.execute/execute-statement-or-prepared-statement!)
            run      (fn [query]
                       (reset! max-rows nil)
                       (row-count query))]
        (mt/with-dynamic-fn-redefs [sql-jdbc.execute/execute-statement-or-prepared-statement!
                                    (fn [driver stmt n params sql]
                                      (reset! max-rows n)
                                      (execute! driver stmt n params sql))]
          (testing "SQL limit at the cap"
            (is (= 4 (run (lib/limit (venues-query) 4))))
            (is (= 5 @max-rows)))
          (testing "page items at the cap"
            (is (= 4 (run (lib/with-page (venues-query) {:page 1 :items 4}))))
            (is (= 5 @max-rows)))
          (testing "cap below the SQL limit"
            (is (= 4 (run (-> (lib/limit (venues-query) 10)
                              (assoc :constraints {:max-results-bare-rows 4})))))
            (is (= 4 @max-rows)))
          (testing "a SQL limit of Integer/MAX_VALUE stays the cap, because one more does not fit in an int"
            (is (= 100 (run (lib/limit (venues-query) Integer/MAX_VALUE))))
            (is (= Integer/MAX_VALUE @max-rows))))))))

(deftest ^:parallel sql-row-bound-test
  ;; resolved at run time, so that this namespace still loads where the private helpers do not exist
  (let [sql-row-bound (requiring-resolve 'metabase.driver.sql-jdbc.execute/sql-row-bound)
        bound-at-cap  (requiring-resolve 'metabase.driver.sql-jdbc.execute/bound-at-cap)
        mbql          (fn [inner-query] {:type :query, :query inner-query})]
    (testing "the bound is the positive :limit, else the positive :page :items, of the final stage only"
      (are [query bound] (= bound (sql-row-bound query))
        (mbql {:limit 4})                            4
        (mbql {:limit 1})                            1
        (mbql {:limit 0})                            nil
        (mbql {:limit -1})                           nil
        (mbql {:page {:page 2, :items 4}})           4
        (mbql {:source-query {:limit 4}})            nil
        {:type :query}                               nil
        {:type :native, :native {:query "SELECT 1"}} nil))
    (testing "the bound counts only when it equals the cap and one more still fits in an int"
      (are [limit max-rows bound] (= bound (bound-at-cap (mbql {:limit limit}) max-rows))
        4                       4                       4
        5                       4                       nil
        3                       4                       nil
        4                       nil                     nil
        (dec Integer/MAX_VALUE) (dec Integer/MAX_VALUE) (dec Integer/MAX_VALUE)
        Integer/MAX_VALUE       Integer/MAX_VALUE       nil))))

(deftest error-while-reading-rows-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    (let [mp         (mt/metadata-provider)
          query      (qp/userland-query (lib/query mp (lib.metadata/table mp (mt/id :venues))))
          error-type (fn [e]
                       (mt/with-dynamic-fn-redefs [sql-jdbc.execute/row-thunk (fn [& _] #(throw e))]
                         (:error_type (qp/process-query query))))]
      (testing "A database error raised while rows are read is an invalid query, whatever its exception class"
        (doseq [e [(SQLException. "More than one row" "21000")
                   (SQLException. "Unique constraint violation" "23505")
                   (SQLNonTransientConnectionException. "Unknown column 'a' in 'field list'" "42S22")]]
          (testing (ex-message e)
            (is (= :invalid-query (error-type e))))))
      (testing "A connection failure while closing the result set is a QP error"
        (let [execute-statement (mt/original-fn #'sql-jdbc.execute/execute-statement-or-prepared-statement!)
              failure           (SQLNonTransientConnectionException. "Connection is broken" "08000")]
          (mt/with-dynamic-fn-redefs [sql-jdbc.execute/row-thunk (fn [& _] #(throw failure))
                                      sql-jdbc.execute/execute-statement-or-prepared-statement!
                                      (fn [& args]
                                        (let [^ResultSet rs (apply execute-statement args)]
                                          (reify ResultSet
                                            (getMetaData [_] (.getMetaData rs))
                                            (close [_]
                                              (.close rs)
                                              (throw failure)))))]
            (is (= :qp (:error_type (qp/process-query query)))))))
      (testing "A failed connection, a canceled or timed-out statement or a transient failure is a QP error"
        (doseq [e [(SQLException. "Unknown row-read failure")
                   (SQLTransientConnectionException. "Unknown connection failure")
                   (SQLTransientConnectionException. "Lock wait timeout exceeded" "HY000" 1205)
                   (SQLException. "Out of memory" "HY001" 1037)
                   (SQLException. "Query was canceled" nil 3)
                   (SQLException. "Out of memory" "53200")
                   (SQLException. "Lock not available" "55P03")
                   (SQLException. "I/O error" "58030")
                   (SQLException. "Idle transaction timeout" "25P03")
                   (SQLException. "Internal error" "XX000")
                   (SQLException. "Cached plan must not change result type" "0A000")
                   (SQLException. "Object closed" "90007")
                   (SQLiteException. "Database busy" SQLiteErrorCode/SQLITE_BUSY)
                   (SQLiteException. "I/O error" SQLiteErrorCode/SQLITE_IOERR)
                   (SQLiteException. "Disk full" SQLiteErrorCode/SQLITE_FULL)
                   (SQLException. "An I/O error occurred while sending to the backend" "08006")
                   (SQLNonTransientConnectionException. "Connection is broken" "90067")
                   (SQLRecoverableException. "Communications link failure")
                   (SQLTimeoutException. "Statement was canceled")
                   (SQLException. "Deadlock detected" "40P01")
                   (SQLException. "Terminating connection due to administrator command" "57P01")]]
          (testing (ex-message e)
            (is (= :qp (error-type e)))))
        (testing "when the query processor canceled the statement, whatever the driver reports"
          (mt/with-dynamic-fn-redefs [sql-jdbc.execute/wire-up-canceled-chan-to-cancel-Statement! (constantly nil)
                                      sql-jdbc.execute/row-thunk
                                      (fn [& _]
                                        #(do (a/offer! qp.pipeline/*canceled-chan* ::canceled)
                                             (throw (SQLException. "Query was canceled" "22012"))))]
            (is (= :qp (:error_type (qp/process-query query))))))
        (with-redefs [driver/query-canceled? (constantly true)]
          (is (= :qp (error-type (SQLException. "Query execution was interrupted" "22012")))))))))

(deftest ^:parallel default-query-error-evidence-test
  (let [classify (get-method sql-jdbc.execute/impl-error-in-query? :sql-jdbc)]
    (doseq [^String state ["21000" "22012" "23505" "42S22"]]
      (is (true? (classify nil (SQLException. "Query error" state)))))))
