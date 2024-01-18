(ns metabase.sync.sync-metadata.indexes-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata.indexes :as sync.indexes]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [toucan2.core :as t2]))

(deftest sync-single-indexed-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :index-info)
    (mt/dataset (mt/dataset-definition "single_index"
                  ["table"
                   [{:field-name "indexed" :indexed? true :base-type :type/Integer}
                    {:field-name "not-indexed" :indexed? false :base-type :type/Integer}]
                   [[1 2]]])
      (is (true? (t2/select-one-fn :database_indexed :model/Field (mt/id :table :indexed))))
      (is (false? (t2/select-one-fn :database_indexed :model/Field (mt/id :table :not-indexed)))))))

(deftest sync-composite-indexed-columns-test
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :index-info) :mongo)
    (mt/dataset (mt/dataset-definition "composite-index"
                  ["table"
                   [{:field-name "first" :indexed? false :base-type :type/Integer}
                    {:field-name "second" :indexed? false :base-type :type/Integer}]
                   [[1 2]]])
      (try
       (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                      (sql.tx/create-index-sql driver/*driver* "table" ["first" "second"]))
       (sync/sync-database! (mt/db))
       (is (true? (t2/select-one-fn :database_indexed :model/Field (mt/id :table :first))))
       (is (false? (t2/select-one-fn :database_indexed :model/Field (mt/id :table :second))))
       (finally
        ;; clean the db so this test is repeatable
        (t2/delete! :model/Database (mt/id)))))))

(driver/register! ::not-support-index-test :abstract? true)

(deftest describe-table-indexes-for-table-that-not-supported-index-test
  (testing "do nothing if the driver doesn't support indexing"
    (mt/with-temp [:model/Database db    {:engine ::not-support-index-test}
                   :model/Table    table {:db_id (:id db)}]
      (is (= @#'sync.indexes/empty-stats (sync.indexes/maybe-sync-indexes! db)))
      (is (= @#'sync.indexes/empty-stats (sync.indexes/maybe-sync-indexes-for-table! db table))))))
