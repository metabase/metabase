(ns ^:mb/driver-tests metabase.model-persistence.task.persist-refresh-write-pool-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.model-persistence.task.persist-refresh :as task.persist-refresh]
   [metabase.test :as mt]))

(deftest refresh-creates-write-pool-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc, :+features [:persist-models]})
    (let [db-id           (mt/id)
          write-cache-key [db-id :write-data]]
      (with-redefs [driver.conn/effective-connection-type
                    (fn [_database]
                      (if (= driver.conn/*connection-type* :write-data)
                        :write-data
                        :default))]
        (try
          (sql-jdbc.conn/invalidate-pool-for-db! (mt/db))
          (testing "write pool does not exist before refresh"
            (is (not (contains? @@#'sql-jdbc.conn/pool-cache-key->connection-pool write-cache-key))))
          (let [test-refresher (reify task.persist-refresh/Refresher
                                 (refresh! [_ database _definition _card]
                                   (sql-jdbc.conn/db->pooled-connection-spec (:id database))
                                   {:state :success})
                                 (unpersist! [_ _database _persisted-info]))]
            (mt/with-temp [:model/Card model {:type :model :database_id db-id}
                           :model/PersistedInfo _pi {:card_id (:id model) :database_id db-id}]
              (#'task.persist-refresh/refresh-tables! db-id test-refresher)))
          (testing "write pool is created during refresh"
            (is (contains? @@#'sql-jdbc.conn/pool-cache-key->connection-pool write-cache-key)))
          (finally
            (sql-jdbc.conn/invalidate-pool-for-db! (mt/db))))))))

(deftest prune-creates-write-pool-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc, :+features [:persist-models]})
    (let [db-id           (mt/id)
          write-cache-key [db-id :write-data]]
      (with-redefs [driver.conn/effective-connection-type
                    (fn [_database]
                      (if (= driver.conn/*connection-type* :write-data)
                        :write-data
                        :default))]
        (try
          (sql-jdbc.conn/invalidate-pool-for-db! (mt/db))
          (testing "write pool does not exist before prune"
            (is (not (contains? @@#'sql-jdbc.conn/pool-cache-key->connection-pool write-cache-key))))
          (let [test-refresher (reify task.persist-refresh/Refresher
                                 (refresh! [_ _database _definition _card]
                                   {:state :success})
                                 (unpersist! [_ database _persisted-info]
                                   (sql-jdbc.conn/db->pooled-connection-spec (:id database))))]
            (mt/with-temp [:model/Card model {:type :model :database_id db-id}
                           :model/PersistedInfo pi {:card_id         (:id model)
                                                    :database_id     db-id
                                                    :state           "deletable"
                                                    :state_change_at (t/minus (t/local-date-time) (t/hours 2))}]
              (#'task.persist-refresh/prune-deletables! test-refresher [pi])))
          (testing "write pool is created during prune"
            (is (contains? @@#'sql-jdbc.conn/pool-cache-key->connection-pool write-cache-key)))
          (finally
            (sql-jdbc.conn/invalidate-pool-for-db! (mt/db))))))))
