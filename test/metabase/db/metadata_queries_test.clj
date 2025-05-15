(ns ^:mb/driver-tests metabase.db.metadata-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.models.table :as table]
   [metabase.query-processor :as qp]
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

(deftest ^:parallel field-distinct-count-test
  (mt/test-drivers (mt/normal-drivers-with-feature ::field-count-tests)
    (is (= 100
           (metadata-queries/field-distinct-count (t2/select-one :model/Field :id (mt/id :checkins :venue_id)))))))

(deftest ^:parallel field-distinct-count-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature ::field-count-tests)
    (is (= 15
           (metadata-queries/field-distinct-count (t2/select-one :model/Field :id (mt/id :checkins :user_id)))))))

(deftest ^:parallel field-count-test
  (mt/test-drivers (mt/normal-drivers-with-feature ::field-count-tests)
    (is (= 1000
           (metadata-queries/field-count (t2/select-one :model/Field :id (mt/id :checkins :venue_id)))))))

(deftest ^:parallel table-rows-sample-test
  (mt/test-drivers (sql-jdbc.tu/normal-sql-jdbc-drivers)
    (let [expected [["20th Century Cafe"]
                    ["25°"]
                    ["33 Taps"]
                    ["800 Degrees Neapolitan Pizzeria"]
                    ["BCD Tofu House"]]
          table    (t2/select-one :model/Table :id (mt/id :venues))
          fields   [(t2/select-one :model/Field :id (mt/id :venues :name))]
          fetch   (fn [truncation-size]
                    (->> (metadata-queries/table-rows-sample table fields (constantly conj)
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
            (let [query (#'metadata-queries/table-rows-sample-query table fields {:truncation-size 4})]
              (is (seq (get-in query [:query :expressions]))))))
        (testing "doesnt' use substrings if driver doesn't support expressions"
          (with-redefs [driver.u/supports? (constantly false)]
            (let [query (#'metadata-queries/table-rows-sample-query table fields {:truncation-size 4})]
              (is (empty? (get-in query [:query :expressions])))))))
      (testing "pre-existing json fields are still marked as `:type/Text`"
        (let [table (mi/instance :model/Table {:id 1234})
              fields [(mi/instance :model/Field {:id 4321, :base_type :type/Text, :semantic_type :type/SerializedJSON})]]
          (with-redefs [driver.u/supports? (constantly true)]
            (let [query (#'metadata-queries/table-rows-sample-query table fields {:truncation-size 4})]
              (is (empty? (get-in query [:query :expressions]))))))))))

(deftest mbql-on-table-requires-filter-will-include-the-filter-test
  (mt/with-temp
    [:model/Database db     {}
     :model/Table    table  {:database_require_filter true :db_id (:id db)}
     :model/Field    field1 {:name "name" :table_id (:id table) :base_type :type/Text}
     :model/Field    field2 {:name "group_id" :table_id (:id table) :database_partitioned true :base_type :type/Integer}]
    (testing "the sample rows query on a table that requires a filter will include a filter"
      ;; currently only applied for bigquery tables in which a table can have a required partition filter
      (is (=? [:> [:field (:id field2) {:base-type :type/Integer}] (mt/malli=? int?)]
              (get-in (#'metadata-queries/table-rows-sample-query table [field1] {}) [:query :filter]))))
    (testing "the mbql on a table that requires a filter will include a filter"
      ;; currently only applied for bigquery tables in which a table can have a required partition filter
      (let [query (atom nil)]
        (with-redefs [qp/process-query (fn [& args]
                                         (reset! query (-> args first :query)))]
          (metadata-queries/table-query (:id table) {})
          (is (=? [:> [:field (:id field2) {:base-type :type/Integer}] (mt/malli=? int?)]
                  (:filter @query))))))))

(deftest ^:parallel text-field?-test
  (testing "recognizes fields suitable for fingerprinting"
    (doseq [field [{:base_type :type/Text}
                   {:base_type :type/Text :semantic_type :type/State}
                   {:base_type :type/Text :semantic_type :type/URL}]]
      (is (#'metadata-queries/text-field? field)))
    (doseq [field [{:base_type :type/JSON} ; json fields in pg
                   {:base_type :type/Text :semantic_type :type/SerializedJSON} ; "legacy" json fields in pg
                   {:base_type :type/Text :semantic_type :type/XML}]]
      (is (not (#'metadata-queries/text-field? field))))))
