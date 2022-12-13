(ns metabase.db.connection-pool-setup-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase.connection-pool :as connection-pool]
            [metabase.db.connection-pool-setup :as mdb.connection-pool-setup]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.models :refer [Database]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import [com.mchange.v2.c3p0 C3P0Registry ConnectionCustomizer PoolBackedDataSource]
           metabase.db.connection_pool_setup.CheckinTracker))

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

(deftest CheckinTracker-test
  (testing "connection customizer is registered"
    (let [customizer (C3P0Registry/getConnectionCustomizer (.getName CheckinTracker))]
      (is (some? customizer) "ConnectionCustomizer is not registered with c3p0")
      (is (instance? ConnectionCustomizer customizer)
          "checkin tracker must satisfy the c3p0 ConnectionCustomizer interface")
      (is (instance? CheckinTracker customizer)
          "ConnectionCustomizer is not an instance of our CheckinTracker")))
  (testing "db activity resets counter"
    (try
      (let [updated? (promise)]
        (add-watch (var-get #'mdb.connection-pool-setup/latest-checkin)
                   ::CheckinTracker-test
                   (fn [_ _ _ _]
                     (deliver updated? ::completed)))
        (reset! (var-get #'mdb.connection-pool-setup/latest-checkin) nil)
        (db/count Database) ;; trigger db access which should reset the latest checkin
        (u/deref-with-timeout updated? 200)
        (let [recent-checkin (deref (var-get #'mdb.connection-pool-setup/latest-checkin))]
          (is (some? recent-checkin)
              "Database activity did not reset latest-checkin")
          (is (instance? java.time.temporal.Temporal recent-checkin)
              "recent-checkin should be a temporal type (OffsetDateTime)")))
      (finally (remove-watch (var-get #'mdb.connection-pool-setup/latest-checkin)
                             ::CheckinTracker-test)))))

(deftest recent-activity-test
  (testing "If latest-checkin is null"
    (reset! (var-get #'mdb.connection-pool-setup/latest-checkin) nil)
    (is (not (mdb.connection-pool-setup/recent-activity?)))
    (db/count Database)
    (testing "db activity makes `recent-activity?` true"
      (is (mdb.connection-pool-setup/recent-activity?))))
  (testing "If latest-checkin is stale"
    (let [duration (var-get #'mdb.connection-pool-setup/recent-window-duration)
          twice-duration (t/minus (t/offset-date-time) duration duration)]
      (reset! (var-get #'mdb.connection-pool-setup/latest-checkin) twice-duration)
      (is (not (mdb.connection-pool-setup/recent-activity?)))
      (db/count Database)
      (testing "db activity makes `recent-activity?` true"
        (is (mdb.connection-pool-setup/recent-activity?)))))
  (testing "Goes stale"
    (with-redefs [mdb.connection-pool-setup/recent-window-duration (t/millis 30)]
      (db/count Database)
      (is (mdb.connection-pool-setup/recent-activity?))
      (testing "When duration elapses should report no recent-activity"
        (Thread/sleep 60)
        (is (not (mdb.connection-pool-setup/recent-activity?))
            "recent-window-duration has elapsed but still recent")))))
