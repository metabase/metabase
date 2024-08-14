(ns metabase.db.metadata-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.util :as driver.u]
   [metabase.models :as models :refer [Database Field Table]]
   [metabase.models.interface :as mi]
   [metabase.models.table :as table]
   [metabase.query-processor :as qp]
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

(deftest table-rows-sample-test
  (mt/test-drivers (sql-jdbc.tu/normal-sql-jdbc-drivers)
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
          (with-redefs [driver.u/supports? (constantly true)]
            (let [query (#'metadata-queries/table-rows-sample-query table fields {:truncation-size 4})]
              (is (seq (get-in query [:query :expressions]))))))
        (testing "doesnt' use substrings if driver doesn't support expressions"
          (with-redefs [driver.u/supports? (constantly false)]
            (let [query (#'metadata-queries/table-rows-sample-query table fields {:truncation-size 4})]
              (is (empty? (get-in query [:query :expressions])))))))
      (testing "pre-existing json fields are still marked as `:type/Text`"
        (let [table (mi/instance Table {:id 1234})
              fields [(mi/instance Field {:id 4321, :base_type :type/Text, :semantic_type :type/SerializedJSON})]]
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

(defn- ordered-filter [query]
  ;; sort by id [:field id option]
  (update query :filter (fn [filter-clause]
                          (if (#{:and :or} (first filter-clause))
                            (into [(first filter-clause)] (sort-by second (rest filter-clause)))
                            filter-clause))))

(deftest add-required-filter-if-needed-test
  (mt/with-temp
    [:model/Database db               {:engine :h2}
     :model/Table    product          {:name "PRODUCT" :db_id (:id db)}
     :model/Field    _product-id      {:name "ID" :table_id (:id product) :base_type :type/Integer}
     :model/Field    _product-name    {:name "NAME" :table_id (:id product) :base_type :type/Integer}
     :model/Table    buyer            {:name "BUYER" :database_require_filter true :db_id (:id db)}
     :model/Field    buyer-id         {:name "ID" :table_id (:id buyer) :base_type :type/Integer :database_partitioned true}
     :model/Table    order            {:name "ORDER" :database_require_filter true :db_id (:id db)}
     :model/Field    order-id         {:name "ID" :table_id (:id order) :base_type :type/Integer}
     :model/Field    _order-buyer-id  {:name "BUYER_ID" :table_id (:id order) :base_type :type/Integer}
     :model/Field    order-product-id {:name "PRODUCT_ID" :table_id (:id order) :base_type :type/Integer :database_partitioned true}]
    (mt/with-db db
      (testing "no op for tables that do not require filter"
        (let [query (:query (mt/mbql-query product))]
          (is (= query
                 (metadata-queries/add-required-filters-if-needed query)))))

      (testing "if the source table requires a filter, add the partitioned filter"
        (let [query (:query (mt/mbql-query order))]
          (is (= (assoc query
                        :filter [:> [:field (:id order-product-id) {:base-type :type/Integer}] -9223372036854775808])
                 (metadata-queries/add-required-filters-if-needed query)))))

      (testing "if a joined table require a filter, add the partitioned filter"
        (let [query (:query (mt/mbql-query product {:joins [{:source-table (:id order)
                                                             :condition    [:= $order.product_id $product.id]
                                                             :alias        "Product"}]}))]
          (is (= (assoc query
                        :filter [:> [:field (:id order-product-id) {:base-type :type/Integer}] -9223372036854775808])
                 (metadata-queries/add-required-filters-if-needed query)))))

      (testing "if both source tables and joined table require a filter, add both"
        (let [query (:query (mt/mbql-query order {:joins [{:source-table (:id buyer)
                                                           :condition    [:= $order.buyer_id $buyer.id]
                                                           :alias        "BUYER"}]}))]
          (is (= (-> query
                     (assoc :filter [:and
                                     [:> [:field (:id buyer-id) {:base-type :type/Integer}] -9223372036854775808]
                                     [:> [:field (:id order-product-id) {:base-type :type/Integer}] -9223372036854775808]])
                     ordered-filter)
                 (-> query
                     metadata-queries/add-required-filters-if-needed
                     ordered-filter)))))

      (testing "Should add an and clause for existing filter"
        (let [query (:query (mt/mbql-query order {:filter [:> $order.id 1]}))]
          (is (= (-> query
                     (assoc :filter [:and
                                     [:> [:field (:id order-id) nil] 1]
                                     [:> [:field (:id order-product-id) {:base-type :type/Integer}] -9223372036854775808]])
                     ordered-filter)
                 (-> query
                     metadata-queries/add-required-filters-if-needed
                     ordered-filter))))))))
