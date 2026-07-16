(ns metabase.sync.jekyll-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.jekyll-metadata :as jekyll-metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private parent-databases
  {:data [{:id 42, :name "Demo DWH", :engine "postgres"}
          {:id 7, :name "Other DWH", :engine "postgres"}]})

(def ^:private parent-metadata
  {:id 42
   :name "Demo DWH"
   :tables [{:id 100
             :name "orders"
             :schema "public"
             :display_name "Orders"
             :description "orders!"
             :estimated_row_count 6
             :fields [{:id 1000, :name "id", :base_type "type/Integer", :database_type "int8"
                       :position 0, :database_position 0, :semantic_type "type/PK"}
                      {:id 1001, :name "customer_id", :base_type "type/Integer", :database_type "int8"
                       :position 1, :database_position 1
                       :semantic_type "type/FK", :fk_target_field_id 1100}
                      {:id 1002, :name "amount", :base_type "type/Decimal", :database_type "numeric"
                       :position 2, :database_position 2
                       :fingerprint {:global {:distinct-count 4}}}]}
            {:id 101
             :name "customers"
             :schema "public"
             :fields [{:id 1100, :name "id", :base_type "type/Integer", :database_type "int8"
                       :position 0, :database_position 0, :semantic_type "type/PK"}]}]})

(defn- mock-parent-get [path]
  (if (= path "/api/database")
    parent-databases
    parent-metadata))

(deftest ingest-parent-metadata-test
  (mt/with-temporary-setting-values [jekyll-parent-url "http://parent.example"
                                     jekyll-parent-api-key "mb_test"]
    (mt/with-temp [:model/Database db {:name "Demo DWH", :initial_sync_status "incomplete"}]
      (with-redefs [jekyll-metadata/parent-get mock-parent-get]
        (#'jekyll-metadata/ingest-parent-metadata!))
      (testing "tables created and marked complete"
        (is (= #{["public" "orders"] ["public" "customers"]}
               (t2/select-fn-set (juxt :schema :name) :model/Table :db_id (:id db))))
        (is (= #{"complete"}
               (t2/select-fn-set :initial_sync_status :model/Table :db_id (:id db)))))
      (testing "database marked complete"
        (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database :id (:id db)))))
      (let [orders-id (t2/select-one-pk :model/Table :db_id (:id db) :name "orders")
            fields (t2/select :model/Field :table_id orders-id {:order-by [:position]})]
        (testing "fields created with types"
          (is (= [["id" :type/Integer] ["customer_id" :type/Integer] ["amount" :type/Decimal]]
                 (map (juxt :name :base_type) fields))))
        (testing "FK target remapped from parent field id to local field id"
          (let [customers-id (t2/select-one-pk :model/Table :db_id (:id db) :name "customers")
                customers-pk (t2/select-one-pk :model/Field :table_id customers-id :name "id")]
            (is (= customers-pk
                   (t2/select-one-fn :fk_target_field_id :model/Field
                                     :table_id orders-id :name "customer_id"))))))
      (testing "idempotent: second run inserts nothing"
        (let [before (t2/count :model/Table :db_id (:id db))]
          (with-redefs [jekyll-metadata/parent-get mock-parent-get]
            (#'jekyll-metadata/ingest-parent-metadata!))
          (is (= before (t2/count :model/Table :db_id (:id db)))))))))

(deftest ingest-noop-without-url-test
  (mt/with-temporary-setting-values [jekyll-parent-url nil]
    (mt/with-temp [:model/Database db {:name "Demo DWH"}]
      (with-redefs [jekyll-metadata/parent-get (fn [_] (throw (ex-info "should not be called" {})))]
        (#'jekyll-metadata/ingest-parent-metadata!))
      (is (zero? (t2/count :model/Table :db_id (:id db)))))))

(deftest ingest-no-matching-parent-database-test
  (mt/with-temporary-setting-values [jekyll-parent-url "http://parent.example"]
    (mt/with-temp [:model/Database db {:name "Unknown DWH"}]
      (with-redefs [jekyll-metadata/parent-get mock-parent-get]
        (#'jekyll-metadata/ingest-parent-metadata!))
      (is (zero? (t2/count :model/Table :db_id (:id db)))))))
