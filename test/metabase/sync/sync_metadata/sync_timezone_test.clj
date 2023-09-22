(ns metabase.sync.sync-metadata.sync-timezone-test
  (:require
   [clj-time.core :as time]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.mysql-test :as mysql-test]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models.database :refer [Database]]
   [metabase.sync.util-test :as sync.util-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- db-timezone [db-or-id]
  (t2/select-one-fn :timezone Database :id (u/the-id db-or-id)))

(deftest sync-timezone-test
  (mt/test-drivers #{:h2 :postgres}
    (testing (str "This tests populating the timezone field for a given database. The sync happens automatically, so "
                  "this test removes it first to ensure that it gets set when missing")
      (mt/dataset test-data
        (let [db                               (mt/db)
              tz-on-load                       (db-timezone db)
              _                                (t2/update! Database (:id db) {:timezone nil})
              tz-after-update                  (db-timezone db)
              ;; It looks like we can get some stale timezone information depending on which thread is used for querying the
              ;; database in sync. Clearing the connection pool to ensure we get the most updated TZ data
              _                                (driver/notify-database-updated driver/*driver* db)
              {:keys [step-info task-history]} (sync.util-test/sync-database! "sync-timezone" db)]
          (testing "only step keys"
            (is (= {:timezone-id "UTC"}
                   (sync.util-test/only-step-keys step-info))))
          (testing "task details"
            (is (= {:timezone-id "UTC"}
                   (:task_details task-history))))
          (testing "On startup is the timezone specified?"
            (is (time/time-zone-for-id tz-on-load)))
          (testing "Check to make sure the test removed the timezone"
            (is (nil? tz-after-update)))
          (testing "Check that the value was set again after sync"
            (is (time/time-zone-for-id (db-timezone db)))))))))

(deftest sync-timezone-mysql-test
  (mt/test-driver :mysql
    (testing "sync-timezone should allow non-standard MySQL default database time zones, such as offset strings (metabase#34050)"
      (let [details (mt/dbdef->connection-details :mysql :db {:database-name "sync_timezone_test"})
            spec    (sql-jdbc.conn/connection-details->spec :mysql details)]
        (mysql-test/drop-if-exists-and-create-db! "sync_timezone_test")
        (t2.with-temp/with-temp [:model/Database database {:engine :mysql, :details (assoc details :dbname "sync_timezone_test")}]
          (let [global-time-zone (-> (jdbc/query spec ["SELECT @@GLOBAL.time_zone;"])
                                     first
                                     (get (keyword "@@global.time_zone")))]
            (try
              (jdbc/execute! spec ["SET GLOBAL time_zone = '+8:00';"])
              (let [{:keys [step-info]} (sync.util-test/sync-database! "sync-timezone" database)]
                (is (= {:timezone-id "+08:00"}
                       (sync.util-test/only-step-keys step-info)))
                (is (= "+08:00"
                       (t2/select-one-fn :timezone :model/Database (:id database)))))
              (finally
                (jdbc/execute! spec [(str "SET GLOBAL time_zone = '" global-time-zone "';")])))))))))
