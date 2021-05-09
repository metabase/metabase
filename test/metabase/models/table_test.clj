(ns metabase.models.table-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.models.table :as table :refer [Table]]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [toucan.db :as db]))

(deftest valid-field-order?-test
  (testing "A valid field ordering is a set IDs  of all active fields in a given table"
    (is (#'table/valid-field-order? (mt/id :venues)
                                    [(mt/id :venues :name)
                                     (mt/id :venues :category_id)
                                     (mt/id :venues :latitude)
                                     (mt/id :venues :longitude)
                                     (mt/id :venues :price)
                                     (mt/id :venues :id)])))
  (testing "Field ordering is invalid if some fields are missing"
    (is (false? (#'table/valid-field-order? (mt/id :venues)
                                            [(mt/id :venues :category_id)
                                             (mt/id :venues :latitude)
                                             (mt/id :venues :longitude)
                                             (mt/id :venues :price)
                                             (mt/id :venues :id)]))))
  (testing "Field ordering is invalid if some fields are from a differnt table"
    (is (false? (#'table/valid-field-order? (mt/id :venues)
                                            [(mt/id :venues :name)
                                             (mt/id :venues :category_id)
                                             (mt/id :venues :latitude)
                                             (mt/id :venues :longitude)
                                             (mt/id :venues :price)
                                             (mt/id :checkins :id)]))))
  (testing "Only active fields should be considerd when checking field order"
    (one-off-dbs/with-blank-db
      (doseq [statement [ ;; H2 needs that 'guest' user for QP purposes. Set that up
                         "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                         ;; Keep DB open until we say otherwise :)
                         "SET DB_CLOSE_DELAY -1;"
                         ;; create table & load data
                         "DROP TABLE IF EXISTS \"BIRDS\";"
                         "CREATE TABLE \"BIRDS\" (\"SPECIES\" VARCHAR PRIMARY KEY, \"EXAMPLE_NAME\" VARCHAR);"
                         "GRANT ALL ON \"BIRDS\" TO GUEST;"
                         (str "INSERT INTO \"BIRDS\" (\"SPECIES\", \"EXAMPLE_NAME\") VALUES "
                              "('House Finch', 'Marshawn Finch'),  "
                              "('California Gull', 'Steven Seagull'), "
                              "('Chicken', 'Colin Fowl');")]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (sync/sync-database! (mt/db))
      (is (#'table/valid-field-order? (mt/id :birds)
                                      [(mt/id :birds :species)
                                       (mt/id :birds :example_name)]))
      (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"BIRDS\" DROP COLUMN \"EXAMPLE_NAME\";"])
      (sync/sync-database! (mt/db))
      (is (#'table/valid-field-order? (mt/id :birds)
                                      [(mt/id :birds :species)])))))

(deftest slashes-in-schema-names-test
  (testing "Schema names should allow forward or back slashes (#8693, #12450)"
    (doseq [schema-name ["my\\schema"
                         "my\\\\schema"
                         "my/schema"
                         "my\\/schema"
                         "my\\\\/schema"]]
      (testing (format "Should be able to create/delete Table with schema name %s" (pr-str schema-name))
        (mt/with-temp Table [{table-id :id} {:schema schema-name}]
          (is (= schema-name
                 (db/select-one-field :schema Table :id table-id))))))))
