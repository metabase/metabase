(ns metabase.driver.druid-jdbc.nested-field-columns-test
  "This namespace contains collection of tests that ensure `:nested-field-columns` works correctly.
   Tests are near duplicates of existing tests from `./test` directory. Reason for that is that Druid JDBC does not
   support test runtime data ingestion and tests had to be modified to work with the driver."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel json-details-only-test
  (mt/test-driver
   :druid-jdbc
   (testing "fields with base-type=type/JSON should have visibility-type=details-only, unlike other fields."
     (mt/dataset
      json
      (let [table (t2/select-one :model/Table :id (mt/id :json))]
        (sql-jdbc.execute/do-with-connection-with-options
         driver/*driver*
         (mt/db)
         nil
         (fn [^java.sql.Connection conn]
           (let [fields     (sql-jdbc.describe-table/describe-table-fields driver/*driver* conn table nil)
                 json-field (first (filter #(= (:name %) "json_bit") fields))
                 text-field (first (filter #(= (:name %) "bloop") fields))]
             (is (= :details-only
                    (:visibility-type json-field)))
             (is (nil? (:visibility-type text-field)))))))))))

(deftest ^:parallel nested-field-column-test
  (mt/test-driver
   :druid-jdbc
   (mt/dataset
    json
    (testing "Nested field column listing"
      (is (= [:type/JSON :type/SerializedJSON]
             (->> (sql-jdbc.sync/describe-table driver/*driver* (mt/db) {:name "json"})
                  :fields
                  (filter #(= (:name %) "json_bit"))
                  first
                  ((juxt :base-type :semantic-type)))))
      (is (= #{{:name "json_bit → 1234123412314",
                :database-type "timestamp",
                :base-type :type/DateTime,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "1234123412314"]}
               {:name "json_bit → boop",
                :database-type "timestamp",
                :base-type :type/DateTime,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "boop"]}
               {:name "json_bit → genres",
                :database-type "text",
                :base-type :type/Array,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "genres"]}
               {:name "json_bit → 1234",
                :database-type "bigint",
                :base-type :type/Integer,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "1234"]}
               {:name "json_bit → doop",
                :database-type "text",
                :base-type :type/Text,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "doop"]}
               {:name "json_bit → noop",
                :database-type "timestamp",
                :base-type :type/DateTime,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "noop"]}
               {:name "json_bit → zoop",
                :database-type "timestamp",
                :base-type :type/DateTime,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "zoop"]}
               {:name "json_bit → published",
                :database-type "text",
                :base-type :type/Text,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "published"]}
               {:name "json_bit → title",
                :database-type "text",
                :base-type :type/Text,
                :database-position 0,
                :json-unfolding false,
                :visibility-type :normal,
                :nfc-path [:json_bit "title"]}}
             (sql-jdbc.sync/describe-nested-field-columns
              driver/*driver*
              (mt/db)
              {:name "json" :id (mt/id "json")})))))))

(deftest ^:parallel big-nested-field-column-test
  (mt/test-driver
   :druid-jdbc
   (mt/dataset
    json
    (testing "Nested field column listing, but big"
      (is (= sql-jdbc.describe-table/max-nested-field-columns
             (count (sql-jdbc.sync/describe-nested-field-columns
                     driver/*driver*
                     (mt/db)
                     {:name "big_json" :id (mt/id "big_json")}))))))))

(deftest json-unfolding-initially-false-test
  (mt/test-driver
   :druid-jdbc
   (mt/dataset
    json
    (let [database (t2/select-one :model/Database :id (mt/id))]
      (testing "When json_unfolding is disabled at the DB level on the first sync"
        ;; Create a new database with the same details as the json dataset, with json unfolding disabled
        (mt/with-temp [:model/Database database {:engine driver/*driver*
                                                 :details (assoc (:details database) :json-unfolding false)}]
          (mt/with-db database
            ;; Sync the new database
            (sync/sync-database! database)
            (let [get-field (fn [] (t2/select-one :model/Field :id (mt/id :json :json_bit)))
                  get-database (fn [] (t2/select-one :model/Database :id (mt/id)))
                  set-json-unfolding-for-field! (fn [v]
                                                  (mt/user-http-request :crowberto :put 200 (format "field/%d" (mt/id :json :json_bit))
                                                                        (assoc (get-field) :json_unfolding v)))
                  set-json-unfolding-for-db! (fn [v]
                                               (let [updated-db (into {} (assoc-in database [:details :json-unfolding] v))]
                                                 (mt/user-http-request :crowberto :put 200 (format "database/%d" (:id database))
                                                                       updated-db)))
                  nested-fields (fn []
                                  (->> (t2/select :model/Field :table_id (mt/id :json) :active true :nfc_path [:not= nil])
                                       (filter (fn [field] (= (first (:nfc_path field)) "json_bit")))))]
              (testing "nested fields are not created"
                (is (empty? (nested-fields))))
              (testing "yet json_unfolding is enabled by default at the field level"
                (is (true? (:json_unfolding (get-field)))))
              (testing "nested fields are added automatically when json unfolding is enabled for the field,
                            and json unfolding is alread enabled for the DB"
                (set-json-unfolding-for-field! false)
                (set-json-unfolding-for-db! true)
                (set-json-unfolding-for-field! true)
                ;; Wait for the sync to finish
                (Thread/sleep 500)
                (is (seq (nested-fields))))
              (testing "nested fields are added when json unfolding is enabled for the DB"
                (set-json-unfolding-for-db! true)
                (is (true? (:json-unfolding (:details (get-database)))))
                (is (true? (:json_unfolding (get-field))))
                (sync/sync-database! (get-database))
                (is (seq (nested-fields))))
              (testing "nested fields are removed when json unfolding is disabled again"
                (set-json-unfolding-for-db! false)
                (sync/sync-database! (get-database))
                (is (empty? (nested-fields))))))))))))

(deftest json-unfolding-initially-true-test
  (mt/test-driver
   :druid-jdbc
   (mt/dataset
    json
    ;; Create a new database with the same details as the json dataset, with json unfolding enabled
    (let [database (t2/select-one :model/Database :id (mt/id))]
      (mt/with-temp [:model/Database database {:engine driver/*driver*
                                               :details (assoc (:details database) :json-unfolding true)}]
        (mt/with-db database
          ;; Sync the new database
          (sync/sync-database! database)
          (let [field (t2/select-one :model/Field :id (mt/id :json :json_bit))
                get-database (fn [] (t2/select-one :model/Database :id (mt/id)))
                set-json-unfolding-for-field! (fn [v]
                                                (mt/user-http-request :crowberto :put 200 (format "field/%d" (mt/id :json :json_bit))
                                                                      (assoc field :json_unfolding v)))
                set-json-unfolding-for-db! (fn [v]
                                             (let [updated-db (into {} (assoc-in database [:details :json-unfolding] v))]
                                               (mt/user-http-request :crowberto :put 200 (format "database/%d" (:id database))
                                                                     updated-db)))
                nested-fields          (fn []
                                         (->> (t2/select :model/Field :table_id (mt/id :json) :active true :nfc_path [:not= nil])
                                              (filter (fn [field] (= (first (:nfc_path field)) "json_bit")))))]
            (testing "json_unfolding is enabled by default at the field level"
              (is (true? (:json_unfolding field))))
            (testing "nested fields are present since json unfolding is enabled by default"
              (is (seq (nested-fields))))
            (testing "nested fields are removed when json unfolding is disabled for the DB"
              (set-json-unfolding-for-db! false)
              (sync/sync-database! (get-database))
              (is (empty? (nested-fields))))
            (testing "nested fields are added when json unfolding is enabled again for the DB"
              (set-json-unfolding-for-db! true)
              (sync/sync-database! (get-database))
              (is (seq (nested-fields))))
            (testing "nested fields are removed when json unfolding is disabled for the field"
              (set-json-unfolding-for-field! false)
              (is (empty? (nested-fields))))
            (testing "nested fields are added when json unfolding is enabled again for the field"
              (set-json-unfolding-for-field! true)
              (is (seq (nested-fields)))))))))))
