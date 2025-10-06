(ns ^:mb/driver-tests metabase.driver.common.table-rows-sample-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.sync.analyze.fingerprint :as fingerprint]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

;;; whether to run `field-count` and `field-distinct-count` tests.
(defmethod driver/database-supports? [::driver/driver ::field-count-tests]
  [_driver _feature _database]
  true)

;;; Redshift tests are randomly failing -- see https://github.com/metabase/metabase/issues/2767
(defmethod driver/database-supports? [:redshift ::field-count-tests]
  [_driver _feature _database]
  false)

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

(deftest table-rows-sample-substring-test
  (testing "substring checking"
    (with-redefs [driver.u/database->driver (constantly (:engine (mt/db)))
                  table/database (constantly (mi/instance :model/Database {:id 5678}))]
      (let [table  (mi/instance :model/Table {:id 1234})
            fields [(mi/instance :model/Field {:id 4321 :base_type :type/Text})]]
        (testing "uses substrings if driver supports expressions"
          (with-redefs [driver.u/supports? (constantly true)]
            (let [query (#'table-rows-sample/table-rows-sample-query table fields {:truncation-size 4})]
              (is (seq (get-in query [:query :expressions]))))))
        (testing "doesnt' use substrings if driver doesn't support expressions"
          (with-redefs [driver.u/supports? (constantly false)]
            (let [query (#'table-rows-sample/table-rows-sample-query table fields {:truncation-size 4})]
              (is (empty? (get-in query [:query :expressions])))))))
      (testing "serialized json stored in text columns is treated as text (potentially large, OOM risk)"
        (let [table (mi/instance :model/Table {:id 1234})
              fields [(mi/instance :model/Field {:id 4321, :base_type :type/Text, :semantic_type :type/SerializedJSON})]]
          (with-redefs [driver.u/supports? (constantly true)]
            (let [query (#'table-rows-sample/table-rows-sample-query table fields {:truncation-size 4})]
              (is (seq (get-in query [:query :expressions])))))))
      (testing "substring is not called upon type/Text derivates"
        (doseq [base-type (filter #(not (or (isa? % :Semantic/*)
                                            (isa? % :Relation/*)))
                                  (descendants :type/Text))]
          (let [table (mi/instance :model/Table {:id 1234})
                fields [(mi/instance :model/Field {:id 4321, :base_type base-type})]]
            (with-redefs [driver.u/supports? (constantly true)]
              (let [query (#'table-rows-sample/table-rows-sample-query table fields {:truncation-size 4})]
                (is (empty? (get-in query [:query :expressions]))))))))
      (testing "primary check is on effective_type"
        (with-redefs [driver.u/supports? (constantly true)]
          (let [table (mi/instance :model/Table {:id 1234})
                fields [(mi/instance :model/Field {:id 4321, :base_type :type/Number :effective_type :type/Text})]
                query (#'table-rows-sample/table-rows-sample-query table fields {:truncation-size 4})]
            (is (seq (get-in query [:query :expressions])))))))))

(deftest ^:synchronized coerced-field-substring-integration-test
  (testing "For coerced fields, effective type is used for fingerprinting (string -> number exmaple)"
    (mt/dataset
      coerced-string-nums-db
      (doseq [id (t2/select-fn-vec :id :model/Field :table_id (mt/id :string_nums))]
        (t2/update! :model/Field :id id {:fingerprint nil
                                         :fingerprint_version 0}))
      (let [fingerprints (atom [])
            fingerprint-query (atom nil)
            orig-table-rows-sample-query @#'table-rows-sample/table-rows-sample-query]
        (with-redefs [fingerprint/save-fingerprint! (fn [_field fingerprint]
                                                      (swap! fingerprints conj fingerprint))
                      table-rows-sample/table-rows-sample-query (fn [& args]
                                                                  (reset! fingerprint-query
                                                                          (apply orig-table-rows-sample-query args)))]
          (fingerprint/fingerprint-table! (t2/select-one :model/Table :id (mt/id :string_nums)))
          (testing "empty expressions = no substring optimization in sample query = use of effective type"
            (is (empty? (-> @fingerprint-query :query :expressions)))
            (is (seq (-> @fingerprint-query :query :fields))))
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
      (is (=? [:> [:field (:id field2) {:base-type :type/Integer}] (mt/malli=? int?)]
              (get-in (#'table-rows-sample/table-rows-sample-query table [field1] {}) [:query :filter]))))
    (testing "the mbql on a table that requires a filter will include a filter"
      ;; currently only applied for bigquery tables in which a table can have a required partition filter
      (let [query (atom nil)]
        (with-redefs [qp/process-query (fn [& args]
                                         (reset! query (-> args first :query)))]
          (is (=? {:filter [:> [:field (:id field2) {:base-type :type/Integer}] (mt/malli=? int?)]}
                  (table-rows-sample/table-rows-sample table [] (constantly conj))))
          (is (=? {:filter [:> [:field (:id field2) {:base-type :type/Integer}] (mt/malli=? int?)]}
                  @query)))))))
