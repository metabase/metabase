(ns ^:mb/driver-tests metabase.driver.common.table-rows-sample-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.sync.analyze.fingerprint :as fingerprint]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; whether to run `field-count` and `field-distinct-count` tests.
(defmethod driver/database-supports? [::driver/driver ::field-count-tests]
  [_driver _feature _database]
  true)

;;; Redshift tests are randomly failing -- see https://github.com/metabase/metabase/issues/2767
(defmethod driver/database-supports? [:redshift ::field-count-tests]
  [_driver _feature _database]
  false)

(deftest ^:parallel table-rows-sample-query-options-test
  (let [mp        meta/metadata-provider
        table     (meta/table-metadata :orders)
        fields    (driver-api/fields mp (:id table))
        id-column (meta/field-metadata :orders :id)
        opts      {:limit    100
                   :order-by [(driver-api/order-by-clause id-column :desc)]}]
    (is (=? {:stages [{:source-table (meta/id :orders)
                       :fields       sequential?
                       :order-by     [[:desc {} [:field {} (meta/id :orders :id)]]]
                       :limit        100}]}
            (#'table-rows-sample/table-rows-sample-query mp table fields opts)))))

(deftest ^:parallel table-rows-sample-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    (let [expected [["20th Century Cafe"]
                    ["25°"]
                    ["33 Taps"]
                    ["800 Degrees Neapolitan Pizzeria"]
                    ["BCD Tofu House"]]
          table    (t2/select-one :model/Table :id (mt/id :venues))
          fields   [(t2/select-one :model/Field :id (mt/id :venues :name))]
          fetch   (fn [truncation-size]
                    (->> (table-rows-sample/table-rows-sample table fields (constantly conj)
                                                              (when truncation-size
                                                                {:truncation-size truncation-size}))
                         ;; since order is not guaranteed do some sorting here so we always get the same results
                         (sort-by first)
                         (take 5)))]
      (is (= :type/Text (-> fields first :base_type)))
      (is (= expected (fetch nil)))
      (testing "truncates text fields (see #13288)"
        (doseq [size [1 4 80]]
          (is (= (mapv (fn [[s]] [(subs (or s "") 0 (min size (count s)))])
                       expected)
                 (fetch size))
              "Did not truncate a text field"))))))

(driver/register! ::does-not-support-expressions-driver, :abstract? true)

(defmethod driver/database-supports? [::does-not-support-expressions-driver :expressions]
  [_driver _feature _database]
  false)

(deftest ^:parallel table-rows-sample-substring-test
  (testing "substring checking"
    (let [database (-> meta/database
                       (assoc :id 456, :engine :h2))
          table    (-> (meta/table-metadata :venues)
                       (assoc :id 1234, :db-id 456))
          fields   [(-> (meta/field-metadata :venues :name)
                        (assoc :table-id 1234, :id 4321, :base-type :type/Text))]
          mp       (lib.tu/mock-metadata-provider
                    {:database database, :tables [table], :fields fields})]
      (testing "uses substrings if driver supports expressions"
        (let [query (#'table-rows-sample/table-rows-sample-query mp table fields {:truncation-size 4})]
          (is (seq (lib/expressions query)))))
      (testing "doesn't use substrings if driver doesn't support expressions"
        (let [mp    (lib.tu/merged-mock-metadata-provider
                     mp
                     {:database (assoc database :engine ::does-not-support-expressions-driver)})
              query (#'table-rows-sample/table-rows-sample-query mp table fields {:truncation-size 4})]
          (is (empty? (get-in query [:query :expressions]))))))))

(deftest ^:parallel table-rows-sample-substring-test-2
  (testing "substring checking"
    (testing "serialized json stored in text columns is treated as text (potentially large, OOM risk)"
      (let [database (-> meta/database
                         (assoc :id 456, :engine :h2))
            table  (-> (meta/table-metadata :venues)
                       (assoc :id 1234, :db-id 456))
            fields [(-> (meta/field-metadata :venues :name)
                        (assoc :table-id 1234, :id 4321, :base-type :type/Text, :semantic-type :type/SerializedJSON))]
            mp       (lib.tu/mock-metadata-provider
                      {:database database, :tables [table], :fields fields})
            query (#'table-rows-sample/table-rows-sample-query mp table fields {:truncation-size 4})]
        (is (seq (lib/expressions query)))))))

(deftest ^:parallel table-rows-sample-substring-test-3
  (testing "substring checking"
    (testing "substring is not called upon type/Text derivates"
      (doseq [base-type (filter #(not (or (isa? % :Semantic/*)
                                          (isa? % :Relation/*)))
                                (descendants :type/Text))]
        (let [database (-> meta/database
                           (assoc :id 456, :engine :h2))
              table  (-> (meta/table-metadata :venues)
                         (assoc :id 1234, :db-id 456))
              fields [(-> (meta/field-metadata :venues :name)
                          (assoc :table-id 1234, :id 4321, :base-type base-type, :effective-type base-type))]
              mp     (lib.tu/mock-metadata-provider
                      {:database database, :tables [table], :fields fields})
              query  (#'table-rows-sample/table-rows-sample-query mp table fields {:truncation-size 4})]
          (is (empty? (lib/expressions query))))))))

(deftest ^:parallel table-rows-sample-substring-test-4
  (testing "substring checking"
    (testing "primary check is on effective_type"
      (let [database (-> meta/database
                         (assoc :id 456, :engine :h2))
            table  (-> (meta/table-metadata :venues)
                       (assoc :id 1234, :db-id 456))
            fields [(-> (meta/field-metadata :venues :name)
                        (assoc :table-id 1234, :id 4321, :base-type :type/Number, :effective-type :type/Text))]
            mp       (lib.tu/mock-metadata-provider
                      {:database database, :tables [table], :fields fields})
            query    (#'table-rows-sample/table-rows-sample-query mp table fields {:truncation-size 4})]
        (is (seq (lib/expressions query)))))))

(deftest ^:synchronized coerced-field-substring-integration-test
  (testing "For coerced fields, effective type is used for fingerprinting (string -> number example)"
    (mt/dataset
      coerced-string-nums-db
      (doseq [id (t2/select-fn-vec :id :model/Field :table_id (mt/id :string_nums))]
        (t2/update! :model/Field :id id {:fingerprint         nil
                                         :fingerprint_version 0}))
      (let [fingerprints                 (atom [])
            fingerprint-query            (atom nil)
            orig-table-rows-sample-query @#'table-rows-sample/table-rows-sample-query]
        (with-redefs [fingerprint/save-fingerprint!             (fn [_field fingerprint]
                                                                  (swap! fingerprints conj fingerprint))
                      table-rows-sample/table-rows-sample-query (fn [& args]
                                                                  (reset! fingerprint-query
                                                                          (apply orig-table-rows-sample-query args)))]
          (fingerprint/fingerprint-table! (t2/select-one :model/Table :id (mt/id :string_nums)))
          (testing "empty expressions = no substring optimization in sample query = use of effective type"
            (is (empty? (lib/expressions @fingerprint-query))))
          (testing "query returns number types due coercion -> numbers are fingerprinted"
            (is (=? [{:type {:type/Number {}}}
                     {:type {:type/Number {}}}
                     {:type {:type/Number {}}}]
                    @fingerprints))))))))

(deftest mbql-on-table-requires-filter-will-include-the-filter-test
  (mt/with-temp
    [:model/Database db     {}
     :model/Table    table  {:database_require_filter true :db_id (:id db)}
     :model/Field    field1 {:name "name" :table_id (:id table) :base_type :type/Text}
     :model/Field    field2 {:name "group_id" :table_id (:id table) :database_partitioned true :base_type :type/Integer}]
    (testing "the sample rows query on a table that requires a filter will include a filter"
      ;; currently only applied for bigquery tables in which a table can have a required partition filter
      (let [mp (lib-be/application-database-metadata-provider (:id db))
            table (lib-be/instance->metadata table :metadata/table)
            field1 (lib-be/instance->metadata field1 :metadata/column)]
        (is (=? [[:> {}
                  [:field {:base-type :type/Integer} (:id field2)]
                  int?]]
                (lib/filters (#'table-rows-sample/table-rows-sample-query mp table [field1] {}))))))
    (testing "the mbql on a table that requires a filter will include a filter"
      ;; currently only applied for bigquery tables in which a table can have a required partition filter
      (with-redefs [qp/process-query (fn [& args]
                                       (first args))]
        (is (=? [[:> {}
                  [:field {:base-type :type/Integer} (:id field2)]
                  int?]]
                (lib/filters (table-rows-sample/table-rows-sample table [] (constantly conj)))))))))
