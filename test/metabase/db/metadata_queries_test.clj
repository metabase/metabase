(ns metabase.db.metadata-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.util :as driver.u]
   [metabase.models :as models :refer [Database Field Table]]
   [metabase.models.interface :as mi]
   [metabase.models.table :as table]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;; Redshift tests are randomly failing -- see https://github.com/metabase/metabase/issues/2767
(defn- metadata-queries-test-drivers []
  (mt/normal-drivers-except #{:redshift}))

(deftest ^:parallel field-distinct-count-test
  (mt/test-drivers (metadata-queries-test-drivers)
    (is (= 100
           (metadata-queries/field-distinct-count (t2/select-one Field :id (mt/id :checkins :venue_id)))))
    (is (= 15
           (metadata-queries/field-distinct-count (t2/select-one Field :id (mt/id :checkins :user_id)))))))

(deftest field-count-test
  (mt/test-drivers (metadata-queries-test-drivers)
    (is (= 1000
           (metadata-queries/field-count (t2/select-one Field :id (mt/id :checkins :venue_id)))))))

(deftest field-distinct-values-test
  (mt/test-drivers (metadata-queries-test-drivers)
    (is (= [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15]
           (map int (metadata-queries/field-distinct-values (t2/select-one Field :id (mt/id :checkins :user_id))))))))

(deftest table-rows-sample-test
  (let [expected [["20th Century Cafe"]
                  ["25°"]
                  ["33 Taps"]
                  ["800 Degrees Neapolitan Pizzeria"]
                  ["BCD Tofu House"]]
        table    (t2/select-one Table :id (mt/id :venues))
        fields   [(t2/select-one Field :id (mt/id :venues :name))]
        fetch!   #(->> (metadata-queries/table-rows-sample table fields (constantly conj) (when % {:truncation-size %}))
                       ;; since order is not guaranteed do some sorting here so we always get the same results
                       (sort-by first)
                       (take 5))]
    (is (= :type/Text (-> fields first :base_type)))
    (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
      (is (= expected (fetch! nil)))
      (testing "truncates text fields (see #13288)"
        (doseq [size [1 4 80]]
          (is (= (mapv (fn [[s]] [(subs (or s "") 0 (min size (count s)))])
                       expected)
                 (fetch! size))
              "Did not truncate a text field")))))

  (testing "substring checking"
    (with-redefs [driver.u/database->driver (constantly (:engine (mt/db)))
                  table/database (constantly (mi/instance Database {:id 5678}))]
      (let [table  (mi/instance Table {:id 1234})
            fields [(mi/instance Field {:id 4321 :base_type :type/Text})]]
        (testing "uses substrings if driver supports expressions"
          (with-redefs [driver/database-supports? (constantly true)]
            (let [query (#'metadata-queries/table-rows-sample-query table fields {:truncation-size 4})]
              (is (seq (get-in query [:query :expressions]))))))
        (testing "doesnt' use substrings if driver doesn't support expressions"
          (with-redefs [driver/database-supports? (constantly false)]
            (let [query (#'metadata-queries/table-rows-sample-query table fields {:truncation-size 4})]
              (is (empty? (get-in query [:query :expressions])))))))
      (testing "pre-existing json fields are still marked as `:type/Text`"
        (let [table (mi/instance Table {:id 1234})
              fields [(mi/instance Field {:id 4321, :base_type :type/Text, :semantic_type :type/SerializedJSON})]]
          (with-redefs [driver/database-supports? (constantly true)]
            (let [query (#'metadata-queries/table-rows-sample-query table fields {:truncation-size 4})]
              (is (empty? (get-in query [:query :expressions]))))))))))

(deftest text-field?-test
  (testing "recognizes fields suitable for fingerprinting"
    (doseq [field [{:base_type :type/Text}
                   {:base_type :type/Text :semantic_type :type/State}
                   {:base_type :type/Text :semantic_type :type/URL}]]
      (is (#'metadata-queries/text-field? field)))
    (doseq [field [{:base_type :type/JSON} ; json fields in pg
                   {:base_type :type/Text :semantic_type :type/SerializedJSON} ; "legacy" json fields in pg
                   {:base_type :type/Text :semantic_type :type/XML}]]
      (is (not (#'metadata-queries/text-field? field))))))
