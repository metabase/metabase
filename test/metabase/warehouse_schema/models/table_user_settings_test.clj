(ns metabase.warehouse-schema.models.table-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest upsert-user-settings!-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id}]
    (testing "creates a row recording only user-settable keys"
      (table-user-settings/upsert-user-settings! [table-id] {:display_name "Orders"
                                                             :description  "Hand-written"
                                                             :name         "not-a-setting"
                                                             :active       false})
      (is (=? {:table_id     table-id
               :display_name "Orders"
               :description  "Hand-written"}
              (t2/select-one :model/TableUserSettings :table_id table-id))))
    (testing "updates the existing row, and records an explicitly-present nil (the user unset the value)"
      (table-user-settings/upsert-user-settings! [table-id] {:description nil :caveats "PII"})
      (is (=? {:display_name "Orders"
               :description  nil
               :caveats      "PII"}
              (t2/select-one :model/TableUserSettings :table_id table-id))))
    (testing "keyword-valued settings round-trip through transforms"
      (table-user-settings/upsert-user-settings! [table-id] {:visibility_type "hidden"
                                                             :data_layer      :hidden
                                                             :entity_type     :entity/GenericTable})
      (is (=? {:visibility_type :hidden
               :data_layer      :hidden
               :entity_type     :entity/GenericTable}
              (t2/select-one :model/TableUserSettings :table_id table-id))))))

(deftest upsert-user-settings!-no-op-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id}]
    (testing "does not create a row when no user-settable keys are present"
      (table-user-settings/upsert-user-settings! [table-id] {:name "not-a-setting"})
      (is (nil? (t2/select-one :model/TableUserSettings :table_id table-id))))
    (testing "does not create a row for an empty list of tables"
      (table-user-settings/upsert-user-settings! [] {:display_name "Orders"})
      (is (nil? (t2/select-one :model/TableUserSettings :table_id table-id))))))

(deftest upsert-user-settings!-bulk-test
  (mt/with-temp [:model/Database {db-id :id}      {}
                 :model/Table    {table-1-id :id} {:db_id db-id}
                 :model/Table    {table-2-id :id} {:db_id db-id}]
    (testing "records settings for many tables at once, mixing existing and missing rows"
      (table-user-settings/upsert-user-settings! [table-1-id] {:description "first"})
      (table-user-settings/upsert-user-settings! [table-1-id table-2-id] {:owner_email "alice@example.com"})
      (is (=? {:description "first"
               :owner_email "alice@example.com"}
              (t2/select-one :model/TableUserSettings :table_id table-1-id)))
      (is (=? {:description nil
               :owner_email "alice@example.com"}
              (t2/select-one :model/TableUserSettings :table_id table-2-id))))))

(deftest merge-back-overlay-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id       db-id
                                                 :description "from sync"}]
    (table-user-settings/upsert-user-settings! [table-id] {:description "user text"})
    (t2/update! :model/Table table-id {:description "user text"})
    (testing "a sync-style update cannot override a user-set description"
      (t2/update! :model/Table table-id {:description "newer sync description"})
      (is (= "user text" (t2/select-one-fn :description :model/Table table-id))))
    (testing "columns without a recorded user setting update normally"
      (t2/update! :model/Table table-id {:entity_type :entity/TransactionTable})
      (is (= :entity/TransactionTable (t2/select-one-fn :entity_type :model/Table table-id))))
    (testing "the user can still change the value by recording the new one first (the API flow)"
      (table-user-settings/upsert-user-settings! [table-id] {:description "revised"})
      (t2/update! :model/Table table-id {:description "revised"})
      (is (= "revised" (t2/select-one-fn :description :model/Table table-id))))
    (testing "an explicitly unset (nil) user setting no longer overrides"
      (table-user-settings/upsert-user-settings! [table-id] {:description nil})
      (t2/update! :model/Table table-id {:description "sync wins again"})
      (is (= "sync wins again" (t2/select-one-fn :description :model/Table table-id))))))

(deftest merge-back-overlay-visibility-pair-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id}]
    (table-user-settings/upsert-user-settings! [table-id] {:visibility_type "hidden"})
    (t2/update! :model/Table table-id {:visibility_type :hidden})
    (testing "user-hidden tables keep a consistent visibility_type/data_layer pair"
      (is (=? {:visibility_type :hidden
               :data_layer      :hidden}
              (t2/select-one :model/Table table-id))))
    (testing "a sync-style attempt to unhide is overridden, and the pair stays consistent"
      (t2/update! :model/Table table-id {:visibility_type nil})
      (is (=? {:visibility_type :hidden
               :data_layer      :hidden}
              (t2/select-one :model/Table table-id))))))

(deftest merge-back-overlay-does-not-fight-system-writes-test
  (mt/with-temp [:model/Database   {db-id :id}    {}
                 :model/Collection {coll-id :id}  {:name "Library Data" :type "library-data"}
                 :model/Table      {table-id :id} {:db_id         db-id
                                                   :collection_id coll-id
                                                   :is_published  true}]
    (table-user-settings/upsert-user-settings! [table-id] {:collection_id coll-id
                                                           :is_published  true})
    (testing "collection_id is not sync-overridable: system unpublish flows can still null it"
      (t2/update! :model/Table table-id {:collection_id nil :is_published false})
      (is (=? {:collection_id nil
               :is_published  false}
              (t2/select-one :model/Table table-id))))
    (testing "and the recorded settings are mirrored along, so they don't claim stale publish intent"
      (is (=? {:collection_id nil
               :is_published  false}
              (t2/select-one :model/TableUserSettings :table_id table-id))))))

(deftest custom-order-fields-records-user-settings-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id}
                 :model/Field    {f1-id :id}    {:table_id table-id}
                 :model/Field    {f2-id :id}    {:table_id table-id}]
    (table/custom-order-fields! (t2/select-one :model/Table table-id) [f2-id f1-id])
    (testing "a manual field reorder is recorded as a user edit"
      (is (=? {:field_order :custom}
              (t2/select-one :model/TableUserSettings :table_id table-id))))))

(deftest table-delete-cascades-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id}]
    (table-user-settings/upsert-user-settings! [table-id] {:display_name "Orders"})
    (t2/delete! :model/Table :id table-id)
    (testing "deleting the Table deletes its user settings"
      (is (nil? (t2/select-one :model/TableUserSettings :table_id table-id))))))

(deftest put-table-records-user-settings-test
  (testing "PUT /api/table/:id records the user-set values"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (mt/user-http-request :crowberto :put 200 (str "table/" table-id)
                            {:display_name    "My Orders"
                             :description     "Hand-written"
                             :visibility_type "hidden"})
      (is (=? {:table_id        table-id
               :display_name    "My Orders"
               :description     "Hand-written"
               :visibility_type :hidden
               :caveats         nil}
              (t2/select-one :model/TableUserSettings :table_id table-id)))
      (testing "later edits only touch the keys the user sent"
        (mt/user-http-request :crowberto :put 200 (str "table/" table-id)
                              {:description "Rewritten"})
        (is (=? {:display_name "My Orders"
                 :description  "Rewritten"}
                (t2/select-one :model/TableUserSettings :table_id table-id)))))))

(deftest bulk-edit-records-user-settings-test
  (testing "POST /api/data-studio/table/edit records the user-set values for every table"
    (mt/with-temp [:model/Database {db-id :id}      {}
                   :model/Table    {table-1-id :id} {:db_id db-id}
                   :model/Table    {table-2-id :id} {:db_id db-id}]
      (mt/user-http-request :crowberto :post 200 "data-studio/table/edit"
                            {:table_ids   [table-1-id table-2-id]
                             :data_layer  "hidden"
                             :owner_email "alice@example.com"})
      (doseq [table-id [table-1-id table-2-id]]
        (is (=? {:table_id    table-id
                 :data_layer  :hidden
                 :owner_email "alice@example.com"}
                (t2/select-one :model/TableUserSettings :table_id table-id)))))))
