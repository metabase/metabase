(ns ^:mb/driver-tests metabase.sync.sync-metadata.indexes-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata.indexes :as sync.indexes]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest sync-single-indexed-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :index-info)
    (mt/dataset (mt/dataset-definition "single_index"
                                       ["table"
                                        [{:field-name "indexed" :indexed? true :base-type :type/Integer}
                                         {:field-name "not-indexed" :indexed? false :base-type :type/Integer}]
                                        [[1 2]]])
      (is (true? (t2/select-one-fn :database_indexed :model/Field (mt/id :table :indexed))))
      (is (not= true (t2/select-one-fn :database_indexed :model/Field (mt/id :table :not-indexed)))))))

(deftest sync-composite-indexed-columns-test
  (mt/test-drivers
    (disj (mt/normal-drivers-with-feature :index-info) :mongo)
    (let [ds (mt/dataset-definition
              "composite-index"
              ["table"
               [{:field-name "first" :indexed? false :base-type :type/Integer}
                {:field-name "second" :indexed? false :base-type :type/Integer}]
               [[1 2]]])]
      (mt/dataset
        ds
        (try
          (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                         (sql.tx/create-index-sql driver/*driver* "table" ["first" "second"]))
          (sync/sync-database! (mt/db))
          (is (true? (t2/select-one-fn :database_indexed :model/Field (mt/id :table :first))))
          (is (not= true (t2/select-one-fn :database_indexed :model/Field (mt/id :table :second))))
          (finally
          ;; clean the db so this test is repeatable
            (t2/delete! :model/Database (mt/id))
            (u/ignore-exceptions
              (tx/destroy-db! driver/*driver* ds))))))))

(driver/register! ::not-support-index-test :abstract? true)

(deftest describe-table-indexes-for-table-that-not-supported-index-test
  (testing "do nothing if the driver doesn't support indexing"
    (mt/with-temp [:model/Database db    {:engine ::not-support-index-test}
                   :model/Table    table {:db_id (:id db)}]
      (is (= @#'sync.indexes/empty-stats (sync.indexes/maybe-sync-indexes! db)))
      (is (= @#'sync.indexes/empty-stats (sync.indexes/maybe-sync-indexes-for-table! db table))))))

(deftest all-indexes->fields-ids-many-indexes-test
  (testing "no exception is thrown when there are very many indexes"
    (mt/test-drivers (mt/normal-drivers-with-feature :describe-indexes :index-info)
      (let [indexes (into [] (driver/describe-indexes driver/*driver* (mt/db)))
            many-indexes (into indexes (repeat 100000 {:table-schema "public",
                                                       :table-name "fake_table",
                                                       :field-name "id"}))
            field-ids (#'sync.indexes/all-indexes->field-ids (:id (mt/db)) many-indexes)]
        (is (seq field-ids))))))

(deftest sync-all-indexes!-test
  (mt/test-drivers
    (set/intersection (mt/normal-drivers-with-feature :index-info)
                      (mt/normal-drivers-with-feature :describe-indexes)
                      (mt/sql-jdbc-drivers))
    (let [ds-to-index-def (mt/dataset-definition
                           "ds_to_index"
                           ["first_table"
                            [{:field-name "first"
                              :base-type :type/Integer}
                             {:field-name "second"
                              :base-type :type/Integer}
                             {:field-name "third"
                              :base-type :type/Integer}]
                            [[1 2 3]]])]
      (mt/dataset ds-to-index-def
        (try
          (testing "Base: Id is indexed"
            (is (some? (t2/select-one :model/Field
                                      {:where [:and
                                               [:in :table_id (t2/select-fn-vec :id :model/Table :db_id (mt/id))]
                                               [:= :display_name "ID"]
                                               [:= :database_indexed true]]}))))
          (testing "Base: Other columns have no index"
            (let [other-fields (t2/select :model/Field
                                          {:where [:and
                                                   [:in :table_id (t2/select-fn-vec :id :model/Table :db_id (mt/id))]
                                                   [:!= :display_name "ID"]]})]
              (is (every? (comp (complement true?) :database_indexed) other-fields))
              (is (= 3 (count other-fields)))))
          (testing "All indexed fields picked up by sync (first, second, third)"
            (doseq [field ["first" "second" "third"]
                    :let [sql (sql.tx/create-index-sql driver/*driver* "first_table" [field])]]
              (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db)) sql))
            (binding [sync.indexes/*update-partition-size* 2]
              (#'sync.indexes/sync-all-indexes! (mt/db)))
            (is (every? :database_indexed
                        (t2/select :model/Field
                                   {:where [:in :table_id (t2/select-fn-vec :id :model/Table :db_id (mt/id))]}))))
          (testing "Index removal is picked up correctly"
            (doseq [field ["first" "second" "third"]
                    :let [sql (format "DROP INDEX %s;" (sql.u/quote-name
                                                        driver/*driver* :index (str "idx_first_table_" field)))]]
              (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db)) sql))
            (binding [sync.indexes/*update-partition-size* 2]
              (#'sync.indexes/sync-all-indexes! (mt/db)))
            (is (every? (complement :database_indexed)
                        (t2/select :model/Field
                                   {:where [:and
                                            [:in :table_id (t2/select-fn-vec :id :model/Table :db_id (mt/id))]
                                            [:!= :display_name "ID"]]}))))
          (finally
            (t2/delete! :model/Database (mt/id))
            (u/ignore-exceptions
              (tx/destroy-db! driver/*driver* ds-to-index-def))))))))
