(ns metabase-enterprise.workspaces.load-metadata-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.load-metadata :as ws.load-metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private sample-document
  {:databases
   [{:name   "Load DW"
     :tables [{:schema       "shop"
               :name         "people"
               :display_name "People"
               :fields       [{:name "id" :display_name "ID" :base_type "type/BigInteger" :database_type "int8"
                               :position 0 :database_position 0 :semantic_type "type/PK"
                               :visibility_type "normal"}
                              {:name "email" :display_name "Email" :base_type "type/Text" :database_type "text"
                               :position 1 :database_position 1 :visibility_type "sensitive"}]}
              {:schema       "shop"
               :name         "orders"
               :display_name "Customer Orders"
               :description  "One row per order"
               :fields       [{:name "person_id" :display_name "Buyer" :base_type "type/BigInteger"
                               :database_type "int8" :position 0 :database_position 0
                               :semantic_type "type/FK" :description "Who placed the order"
                               :visibility_type "normal"
                               :fk_target {:schema "shop" :table "people" :field "id"}}
                              {:name "created_at" :display_name "Created At" :base_type "type/Text"
                               :database_type "text" :position 1 :database_position 1
                               :effective_type "type/DateTime" :coercion_strategy "Coercion/ISO8601->DateTime"
                               :visibility_type "normal"}
                              {:name "internal_note" :display_name "Internal Note" :base_type "type/Text"
                               :database_type "text" :position 2 :database_position 2
                               :visibility_type "hidden"}
                              {:name "ghost_id" :display_name "Ghost ID" :base_type "type/Integer"
                               :database_type "int4" :position 3 :database_position 3
                               :visibility_type "normal"
                               :fk_target {:schema "shop" :table "missing" :field "id"}}]}
              {:schema          "shop"
               :name            "audit_log"
               :display_name    "Audit Log"
               :visibility_type "hidden"
               :fields          [{:name "id" :display_name "ID" :base_type "type/Integer" :database_type "int4"
                                  :position 0 :database_position 0 :visibility_type "normal"}]}]}]})

(defn- write-document! [path document]
  (spit path (json/encode document)))

(defn- tables-as-users-see-them [db-id]
  (t2/select [:model/Table :id :schema :name :display_name :description :visibility_type :initial_sync_status]
             {:from     [(warehouse-schema-overlay/table-query)]
              :where    [:= :db_id db-id]
              :order-by [:name]}))

(defn- field-as-users-see-it [table-id field-name]
  (t2/select-one [:model/Field :id :name :display_name :description :base_type :effective_type :coercion_strategy
                  :database_type :semantic_type :visibility_type :fk_target_field_id :position :database_position]
                 {:from  [(warehouse-schema-overlay/field-query)]
                  :where [:and [:= :table_id table-id] [:= :name field-name]]}))

(deftest load-metadata-file-builds-tables-and-fields-test
  (mt/with-temp [:model/Database {db-id :id} {:name "Load DW" :engine :h2 :details {}}]
    (mt/with-temp-file [path "load-metadata.json"]
      (write-document! path sample-document)
      (is (= #{db-id} (ws.load-metadata/load-metadata-file! path {"Load DW" db-id})))
      (testing "the database is marked synced, so the initial sync is skipped"
        (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database db-id))))
      (let [tables   (tables-as-users-see-them db-id)
            by-name  (into {} (map (juxt :name identity)) tables)
            people   (by-name "people")
            orders   (by-name "orders")]
        (testing "tables are matched by schema and name, with curated values and visibility"
          (is (= [{:schema "shop" :name "audit_log" :display_name "Audit Log" :description nil
                   :visibility_type :hidden :initial_sync_status "complete"}
                  {:schema "shop" :name "orders" :display_name "Customer Orders" :description "One row per order"
                   :visibility_type nil :initial_sync_status "complete"}
                  {:schema "shop" :name "people" :display_name "People" :description nil
                   :visibility_type nil :initial_sync_status "complete"}]
                 (map #(dissoc (into {} %) :id) tables))))
        (testing "fields carry types, curated values and visibility"
          (is (=? {:display_name "ID" :base_type :type/BigInteger :database_type "int8" :semantic_type :type/PK
                   :visibility_type :normal :position 0 :database_position 0}
                  (field-as-users-see-it (:id people) "id")))
          (is (=? {:visibility_type :sensitive}
                  (field-as-users-see-it (:id people) "email")))
          (is (=? {:visibility_type :hidden}
                  (field-as-users-see-it (:id orders) "internal_note")))
          (is (=? {:base_type :type/Text :effective_type :type/DateTime
                   :coercion_strategy :Coercion/ISO8601->DateTime}
                  (field-as-users-see-it (:id orders) "created_at"))))
        (testing "the field rows themselves have effective_type = base_type, as sync leaves them"
          (is (= {"id"            [:type/BigInteger :type/BigInteger]
                  "email"         [:type/Text :type/Text]
                  "person_id"     [:type/BigInteger :type/BigInteger]
                  "created_at"    [:type/Text :type/Text]
                  "internal_note" [:type/Text :type/Text]
                  "ghost_id"      [:type/Integer :type/Integer]}
                 (into {}
                       (map (juxt :name (juxt :base_type :effective_type)))
                       (t2/select [:model/Field :name :base_type :effective_type]
                                  {:from  [(warehouse-schema-overlay/field-query {:user-settings? false})]
                                   :where [:in :table_id [(:id people) (:id orders)]]})))))
        (testing "an FK resolves to the child's own field, matched by schema.table.field"
          (is (=? {:display_name       "Buyer"
                   :description        "Who placed the order"
                   :semantic_type      :type/FK
                   :fk_target_field_id (:id (field-as-users-see-it (:id people) "id"))}
                  (field-as-users-see-it (:id orders) "person_id"))))
        (testing "an FK whose target isn't in the document is dropped"
          (is (=? {:fk_target_field_id nil}
                  (field-as-users-see-it (:id orders) "ghost_id"))))
        (testing "curated values live in the user-settings tables, so sync can't overwrite them"
          (is (=? {:description nil :visibility_type nil}
                  (t2/select-one [:model/Table :description :visibility_type] (:id orders))))
          (is (=? {:description "One row per order"}
                  (t2/select-one :model/TableUserSettings :table_id (:id orders))))
          (is (=? {:visibility_type :hidden}
                  (t2/select-one :model/FieldUserSettings
                                 :field_id (:id (field-as-users-see-it (:id orders) "internal_note"))))))))))

(deftest load-metadata-file-skips-a-database-that-is-already-loaded-test
  (mt/with-temp-file [path "load-metadata.json"]
    (write-document! path sample-document)
    (testing "a database whose initial sync is complete is left alone"
      (mt/with-temp [:model/Database {db-id :id} {:name "Load DW" :engine :h2 :details {}
                                                  :initial_sync_status "complete"}]
        (is (= #{} (ws.load-metadata/load-metadata-file! path {"Load DW" db-id})))
        (is (zero? (t2/count :model/Table :db_id db-id)))))
    (testing "a database that already has tables, even ones the document doesn't name, is left alone"
      (mt/with-temp [:model/Database {db-id :id} {:name "Load DW" :engine :h2 :details {}}
                     :model/Table    _           {:db_id db-id :schema "other" :name "unrelated"}]
        (is (= #{} (ws.load-metadata/load-metadata-file! path {"Load DW" db-id})))
        (is (= 1 (t2/count :model/Table :db_id db-id)))
        (is (= "incomplete" (t2/select-one-fn :initial_sync_status :model/Database db-id)))))
    (testing "a database the document lists no tables for is left to sync, not marked synced"
      (mt/with-temp [:model/Database {db-id :id} {:name "Load DW" :engine :h2 :details {}}]
        (write-document! path {:databases [{:name "Load DW" :tables []}]})
        (is (= #{} (ws.load-metadata/load-metadata-file! path {"Load DW" db-id})))
        (is (= "incomplete" (t2/select-one-fn :initial_sync_status :model/Database db-id))))
      (write-document! path sample-document))
    (testing "a database the document doesn't name is left alone"
      (mt/with-temp [:model/Database {db-id :id} {:name "Other DW" :engine :h2 :details {}}]
        (is (= #{} (ws.load-metadata/load-metadata-file! path {"Other DW" db-id})))
        (is (zero? (t2/count :model/Table :db_id db-id)))))))

(deftest load-metadata-file-refuses-a-malformed-document-whole-test
  (mt/with-temp [:model/Database {db-id :id} {:name "Load DW" :engine :h2 :details {}}]
    (doseq [[what write!] {"a missing file"   (fn [_path] nil)
                           "a file that isn't JSON" (fn [path] (spit path "{not json"))
                           "an unknown base type"
                           (fn [path]
                             (write-document! path (assoc-in sample-document
                                                             [:databases 0 :tables 0 :fields 1 :base_type]
                                                             "type/NotAType")))
                           "a field without a name"
                           (fn [path]
                             (write-document! path (update-in sample-document
                                                              [:databases 0 :tables 1 :fields 0]
                                                              dissoc :name)))
                           "an unknown key"
                           (fn [path]
                             (write-document! path (assoc-in sample-document
                                                             [:databases 0 :tables 0 :id] 7)))}]
      (testing what
        (mt/with-temp-file [path "load-metadata.json"]
          (write! path)
          (is (= #{} (ws.load-metadata/load-metadata-file! path {"Load DW" db-id})))
          (is (zero? (t2/count :model/Table :db_id db-id)))
          (is (= "incomplete" (t2/select-one-fn :initial_sync_status :model/Database db-id))))))))

(deftest load-metadata-file-rolls-back-a-failed-load-test
  (testing "a load that fails after creating rows leaves the database empty and unsynced, for sync to fill"
    (mt/with-temp [:model/Database {db-id :id} {:name "Load DW" :engine :h2 :details {}}]
      (mt/with-temp-file [path "load-metadata.json"]
        (write-document! path sample-document)
        (mt/with-dynamic-fn-redefs [ws.db/insert-field-user-settings! (fn [_] (throw (ex-info "boom" {})))]
          (is (= #{} (ws.load-metadata/load-metadata-file! path {"Load DW" db-id}))))
        (is (zero? (t2/count :model/Table :db_id db-id)))
        (is (= "incomplete" (t2/select-one-fn :initial_sync_status :model/Database db-id)))))))
