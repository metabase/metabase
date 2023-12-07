(ns metabase.sync.sync-metadata.indexes-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [toucan2.core :as t2]))

(deftest sync-single-indexed-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :indexing)
    (mt/dataset (mt/dataset-definition "single_index"
                  ["table"
                   [{:field-name "indexed" :indexed? true :base-type :type/Integer}
                    {:field-name "not-indexed" :indexed? false :base-type :type/Integer}]
                   [[1 2]]])
      (is (true? (t2/select-one-fn :database_indexed :model/Field (mt/id :table :indexed))))
      (is (false? (t2/select-one-fn :database_indexed :model/Field (mt/id :table :not-indexed)))))))

(deftest sync-composite-indexed-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :indexing)
    (mt/test-drivers (mt/dataset-definition "composite-index"
                       ["table"
                        [{:field-name "first" :indexed? false :base-type :type/Integer}
                         {:field-name "second" :indexed? false :base-type :type/Integer}]
                        [[1 2]]])
      (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                     (sql.tx/create-index-sql "table" ["first" "second"]))
      (is (true? (t2/select-one-fn :database_indexed :model/Field (mt/id :single_indexed :first))))
      (is (false? (t2/select-one-fn :database_indexed :model/Field (mt/id :single_indexed :second)))))))
