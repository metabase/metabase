(ns metabase.model-persistence.task.persist-refresh-write-pool-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.model-persistence.task.persist-refresh :as task.persist-refresh]
   [metabase.test :as mt]))

;; Verify that the driver's refresh!/unpersist! establish a write-connection context for their DDL: drive the
;; real refresher with the warehouse calls stubbed, and capture *connection-type* at the DDL boundary.

(deftest refresh-runs-ddl-under-write-connection-test
  (doseq [engine [:postgres :mysql]]
    (driver/the-initialized-driver engine)
    (testing (str engine " refresh! runs its DDL under a write-connection context")
      (mt/with-model-cleanup [:model/TaskHistory]
        (mt/with-temp [:model/Database     db {:engine engine :settings {:persist-models-enabled true}}
                       :model/Card         model {:type :model :database_id (:id db)}
                       :model/PersistedInfo _pi {:card_id (:id model) :database_id (:id db)}]
          (let [ddl-ctx (atom ::unset)]
            (with-redefs [driver-api/compile                               (fn [_query] {:query "SELECT 1" :params []})
                          sql-jdbc.conn/db->pooled-connection-spec         (fn [_database] {:fake :spec})
                          sql-jdbc.execute/do-with-connection-with-options (fn [_driver _database _opts _f]
                                                                             (reset! ddl-ctx @#'driver.conn/*connection-type*)
                                                                             {:state :success})]
              (#'task.persist-refresh/refresh-tables! (:id db) @#'task.persist-refresh/dispatching-refresher nil))
            (is (= :write-data @ddl-ctx))))))))

(deftest unpersist-runs-ddl-under-write-connection-test
  (doseq [engine [:postgres :mysql]]
    (driver/the-initialized-driver engine)
    (testing (str engine " unpersist! runs its DDL under a write-connection context")
      (mt/with-model-cleanup [:model/TaskHistory]
        (mt/with-temp [:model/Database     db {:engine engine :settings {:persist-models-enabled true}}
                       :model/Card         model {:type :model :database_id (:id db)}
                       :model/PersistedInfo pi {:card_id         (:id model)
                                                :database_id     (:id db)
                                                :state           "deletable"
                                                :state_change_at (t/minus (t/local-date-time) (t/hours 2))}]
          (let [ddl-ctx (atom ::unset)]
            (with-redefs [sql-jdbc.execute/do-with-connection-with-options (fn [_driver _database _opts _f]
                                                                             (reset! ddl-ctx @#'driver.conn/*connection-type*)
                                                                             nil)]
              (#'task.persist-refresh/prune-deletables! @#'task.persist-refresh/dispatching-refresher [pi]))
            (is (= :write-data @ddl-ctx))))))))
