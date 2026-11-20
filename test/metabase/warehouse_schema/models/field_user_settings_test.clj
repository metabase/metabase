(ns metabase.warehouse-schema.models.field-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(defn- field-row
  "The Field row."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(deftest plain-write-reaches-field-row-test
  (testing "plain insert and update of settings write user values to Field row"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id      table-id
                                                :name          "sync_name"
                                                :display_name  "Sync Name"
                                                :description   "sync description"
                                                :semantic_type :type/Category}]
      (t2/insert! :model/FieldUserSettings {:field_id field-id :display_name "User Name"})
      (is (=? {:display_name "User Name" :description "sync description"} (field-row field-id)))
      (t2/update! :model/FieldUserSettings :field_id field-id {:description nil :description_set true :semantic_type :type/Name})
      (is (=? {:display_name "User Name" :description nil :semantic_type :type/Name} (field-row field-id)))
      (testing "taking value back leaves Field row as it is"
        (t2/update! :model/FieldUserSettings :field_id field-id {:semantic_type nil :semantic_type_set false})
        (is (= :type/Name (:semantic_type (field-row field-id))))))))

(deftest plain-write-of-coercion-reaches-field-row-test
  (testing "plain write of coercion and effective type reaches Field row together"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id :base_type :type/Integer :effective_type :type/Integer}]
      (t2/insert! :model/FieldUserSettings {:field_id          field-id
                                            :coercion_strategy :Coercion/UNIXSeconds->DateTime
                                            :effective_type    :type/DateTime})
      (is (=? {:coercion_strategy :Coercion/UNIXSeconds->DateTime :effective_type :type/DateTime}
              (field-row field-id))))))

(deftest plain-write-refused-by-field-rolls-back-settings-test
  (testing "plain update of settings that Field refuses leaves settings as they were"
    (mt/with-temp [:model/Database {other-db-id :id} {}
                   :model/Table    {other-table-id :id} {:db_id other-db-id}
                   :model/Field    {other-field-id :id} {:table_id other-table-id}
                   :model/Table    {table-id :id} {}
                   :model/Field    {field-id :id} {:table_id table-id}]
      (t2/insert! :model/FieldUserSettings {:field_id field-id :display_name "User Name"})
      (is (thrown-with-msg? Exception #"Invalid field"
                            (t2/update! :model/FieldUserSettings :field_id field-id
                                        {:fk_target_field_id other-field-id})))
      (is (nil? (t2/select-one-fn :fk_target_field_id :model/FieldUserSettings :field_id field-id)))
      (is (nil? (:fk_target_field_id (field-row field-id)))))))

(deftest upsert-writes-user-null-test
  (testing "upsert writes NULL of column without flag to Field row, as before"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id :as field} {:table_id table-id :caveats "sync caveats"}]
      (field-user-settings/upsert-field-user-settings! field {:caveats nil :display_name "User Name"})
      (is (=? {:caveats nil :display_name "User Name"} (field-row field-id))))))
