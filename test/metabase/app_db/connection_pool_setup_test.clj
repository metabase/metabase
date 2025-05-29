(ns metabase.app-db.connection-pool-setup-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.connection-pool-setup :as mdb.connection-pool-setup]
   [metabase.app-db.core :as app-db]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.connection-pool :as connection-pool]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (com.mchange.v2.c3p0 C3P0Registry ConnectionCustomizer PoolBackedDataSource)
   (metabase.app_db.connection_pool_setup MetabaseConnectionCustomizer)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest connection-pool-spec-test
  (testing "Should be able to create a connection pool"
    (letfn [(test* [db-type data-source]
              (let [^PoolBackedDataSource data-source (mdb.connection-pool-setup/connection-pool-data-source db-type data-source)]
                (try
                  (is (instance? javax.sql.DataSource data-source))
                  (is (= (format "metabase-%s-app-db" (name db-type))
                         (.getDataSourceName data-source)))
                  (is (= [{:one 1}]
                         (jdbc/query {:datasource data-source} ["SELECT 1 AS one;"])))
                  (finally
                    (connection-pool/destroy-connection-pool! data-source)))))]
      (testing "from a jdbc-spec map"
        (test* :h2 (mdb.data-source/broken-out-details->DataSource
                    :h2
                    {:subprotocol "h2"
                     :subname     (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))
                     :classname   "org.h2.Driver"})))
      (testing "from a connection URL"
        (test* :h2 (mdb.data-source/raw-connection-string->DataSource
                    (format "jdbc:h2:mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))))))))

(defn- simulate-db-activity
  "Hit the application db a few times. In practice, monitoring based on db checkins could be not super deterministic and
  it is an optimization. This simulates that and reduces the potential for flakes"
  []
  (dotimes [_ 5]
    (t2/count :model/Database)))

(deftest MetabaseConnectionCustomizer-test
  (testing "connection customizer is registered"
    (let [customizer (C3P0Registry/getConnectionCustomizer (.getName MetabaseConnectionCustomizer))]
      (is (some? customizer) "ConnectionCustomizer is not registered with c3p0")
      (is (instance? ConnectionCustomizer customizer)
          "checkin tracker must satisfy the c3p0 ConnectionCustomizer interface")
      (is (instance? MetabaseConnectionCustomizer customizer)
          "ConnectionCustomizer is not an instance of our MetabaseConnectionCustomizer")))
  (testing "db activity resets counter"
    (try
      (let [updated? (promise)]
        (add-watch (var-get #'mdb.connection-pool-setup/latest-activity)
                   ::MetabaseConnectionCustomizer-test
                   (fn [_key _ref _old-state _new-state]
                     (deliver updated? ::completed)))
        (reset! (var-get #'mdb.connection-pool-setup/latest-activity) nil)
        (simulate-db-activity)
        (u/deref-with-timeout updated? 200)
        (let [recent-checkin (deref (var-get #'mdb.connection-pool-setup/latest-activity))]
          (is (some? recent-checkin)
              "Database activity did not reset latest-checkin")
          (is (instance? java.time.temporal.Temporal recent-checkin)
              "recent-checkin should be a temporal type (OffsetDateTime)")))
      (finally (remove-watch (var-get #'mdb.connection-pool-setup/latest-activity)
                             ::MetabaseConnectionCustomizer-test)))))
(deftest recent-activity-test
  ;; these tests are difficult to make non-flaky. Other threads can hit the db of course, and the lifecycle of the
  ;; connection pool is worked from other threads. This means we can't isolate the `latest-checkin` atom. Many will take
  ;; the value of the checkin timestamp and pass it to `recent-activity?*` to act on the value at the time it cares
  ;; about rather than trying to suppress writes to the `latest-checkin`. If you change this, run the test about 500
  ;; times to make sure there aren't flakes.
  (testing "If latest-checkin is null"
    (reset! (var-get #'mdb.connection-pool-setup/latest-activity) nil)
    (is (not (#'mdb.connection-pool-setup/recent-activity?* nil (t/millis 10))))
    (testing "db activity makes `recent-activity?` true"
      (simulate-db-activity)
      (is (mdb.connection-pool-setup/recent-activity?))))
  (testing "If latest-checkin is stale"
    (let [duration (var-get #'mdb.connection-pool-setup/recent-window-duration)
          twice-duration (t/minus (t/offset-date-time) duration duration)]
      (is (not (#'mdb.connection-pool-setup/recent-activity?* twice-duration duration)))))
  (testing "Goes stale"
    (simulate-db-activity)
    ;; can't easily control background syncs or activity so just suppress registering
    (is (mdb.connection-pool-setup/recent-activity?))
    (testing "When duration elapses should report no recent-activity"
      (let [latest-activity (deref (var-get #'mdb.connection-pool-setup/latest-activity))]
        (Thread/sleep 30)
        (is (not (#'mdb.connection-pool-setup/recent-activity?* latest-activity (t/millis 10)))
            "recent-window-duration has elapsed but still recent")))))

(deftest reset-read-only-test
  (testing "For Postgres app DBs, we should be executing `DISCARD ALL` when checking in a connection to reset state including read-only"
    (when (= (app-db/db-type) :postgres)
      (let [connection* (promise)]
        (with-redefs [mdb.connection-pool-setup/on-check-in
                      (let [orig @#'mdb.connection-pool-setup/on-check-in]
                        (fn [^java.sql.Connection connection]
                          (u/prog1 (orig connection)
                            (deliver connection* (.unwrap connection java.sql.Connection)))))]
          ;; check out a connection and set it to read-only.
          (with-open [conn (.getConnection (app-db/app-db))]
            (.setReadOnly conn true)
            (is (.isReadOnly conn)))
          (testing "on-check-in should be called; Connection read-only should be reset after checking in"
            (let [^java.sql.Connection conn (u/deref-with-timeout connection* (u/seconds->ms 5))]
              (is (not (.isReadOnly conn))))))))))
