(ns metabase.warehouse-schema.models.table-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [toucan2.core :as t2]))

(defn- user-table
  "The Table as users see it: what they set, else what sync wrote."
  [table-id]
  (t2/select-one :model/Table :id table-id {:from [(warehouse-schema-overlay/table-query)]}))

(deftest table-query-test
  (testing "a query sourced from table-query reads the user's values over sync's"
    (mt/with-temp [:model/Table {table-id :id :as table} {:display_name "Sync Name"
                                                          :description  "sync description"
                                                          :entity_type  :entity/GenericTable}]
      (table-user-settings/upsert-user-settings table {:display_name "User Name" :description nil})
      (testing "the sync row is untouched"
        (is (=? {:display_name "Sync Name" :description "sync description"}
                (t2/select-one :model/Table :id table-id))))
      (testing "user values, a user NULL included, replace the sync ones"
        (is (=? {:id table-id :display_name "User Name" :description nil :entity_type :entity/GenericTable}
                (user-table table-id))))
      (testing "a flag left false means the sync value shows again"
        (t2/update! :model/TableUserSettings table-id {:description_set false})
        (is (= "sync description" (:description (user-table table-id))))))))

(deftest not-null-columns-need-no-flag-test
  (testing "a NULL in a column that is NOT NULL on the Table can only mean the user set nothing"
    (mt/with-temp [:model/Table {table-id :id :as table} {:field_order :database}]
      (is (= :database (:field_order (user-table table-id))))
      (table-user-settings/upsert-user-settings table {:field_order :alphabetical})
      (is (= :alphabetical (:field_order (user-table table-id))))
      (testing "clearing it falls back to the Table's own value"
        (table-user-settings/unset-user-settings! table [:field_order])
        (is (= :database (:field_order (user-table table-id))))))))

(deftest visibility-pair-is-recorded-whole-test
  (testing "visibility_type and data_layer are one choice, so setting either records both"
    (mt/with-temp [:model/Table {table-id :id :as table} {}]
      (table-user-settings/upsert-user-settings table {:visibility_type :hidden})
      (is (=? {:visibility_type :hidden :data_layer :hidden} (user-table table-id)))
      (table-user-settings/upsert-user-settings table {:data_layer :internal})
      (is (=? {:visibility_type nil :data_layer :internal} (user-table table-id))))))

(deftest publishing-is-recorded-as-a-pair-test
  (testing "collection_id is only meaningful alongside is_published, which is NOT NULL and answers for the pair"
    (mt/with-temp [:model/Collection {collection-id :id} {}
                   :model/Table      {table-id :id :as table} {}]
      (table-user-settings/upsert-user-settings table {:is_published true :collection_id collection-id})
      (is (=? {:is_published true :collection_id collection-id} (user-table table-id)))
      (testing "a Table published into the root collection keeps its NULL collection_id"
        (table-user-settings/upsert-user-settings table {:is_published true :collection_id nil})
        (is (=? {:is_published true :collection_id nil} (user-table table-id)))))))

(deftest bulk-upsert-test
  (testing "a bulk edit records the same values on every Table it names"
    (mt/with-temp [:model/Table {t1 :id} {}
                   :model/Table {t2 :id} {}]
      (table-user-settings/upsert-user-settings-for-tables! #{t1 t2} {:owner_email "owner@example.com"})
      (is (= ["owner@example.com" "owner@example.com"]
             (map (comp :owner_email user-table) [t1 t2])))
      (is (= 2 (count (warehouse-schema.db/table-ids-with-user-settings #{t1 t2})))))))

(deftest invariants-hold-however-the-row-is-written-test
  (testing "the model's hooks, not just the upsert fns, enforce what has to hold of a settings row -- so a serdes
            import or any other writer cannot store one that readers would misread"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}
                   :model/Field    {field-id :id} {:table_id table-id}]
      (testing "a written column carries its _set flag, on insert and on update"
        (t2/insert! :model/FieldUserSettings {:field_id field-id :description "d"})
        (is (true? (t2/select-one-fn :description_set :model/FieldUserSettings :field_id field-id)))
        (t2/update! :model/FieldUserSettings field-id {:semantic_type :type/Category})
        (is (true? (t2/select-one-fn :semantic_type_set :model/FieldUserSettings :field_id field-id))))
      (testing "a flag the writer set itself is left alone, which is how a value is taken back"
        (t2/insert! :model/TableUserSettings {:table_id table-id :description "d"})
        (t2/update! :model/TableUserSettings table-id {:description nil :description_set false})
        (is (false? (t2/select-one-fn :description_set :model/TableUserSettings :table_id table-id))))
      (testing "both halves of the visibility choice move together"
        (t2/update! :model/TableUserSettings table-id {:visibility_type :hidden})
        (is (=? {:visibility_type :hidden :data_layer :hidden
                 :visibility_type_set true :data_layer_set true}
                (t2/select-one :model/TableUserSettings :table_id table-id))))
      (testing "a change a user may not make is refused whoever writes it"
        (t2/update! :model/TableUserSettings table-id {:data_authority :authoritative})
        (is (thrown-with-msg? Exception #"Cannot set data_authority back to unconfigured"
                              (t2/update! :model/TableUserSettings table-id
                                          {:data_authority :unconfigured})))))))
