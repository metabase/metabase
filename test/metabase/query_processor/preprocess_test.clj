(ns metabase.query-processor.preprocess-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]))

(deftest preprocess-caching-test
  (testing "`preprocess` should work the same even if query has cached results (#18579)"
    ;; make a copy of the `test-data` DB so there will be no cache entries from previous test runs possibly affecting
    ;; this test.
    (mt/with-temp-copy-of-db
      (let [query            (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                                    :cache-strategy {:type             :ttl
                                                     :multiplier       60
                                                     :avg-execution-ms 100
                                                     :min-duration-ms  0})
            run-query        (fn []
                               (let [results (qp/process-query query)]
                                 {:cached?  (boolean (:cached (:cache/details results)))
                                  :num-rows (count (mt/rows results))}))
            expected-results (qp.preprocess/preprocess query)]
        (testing "Check preprocess before caching to make sure results make sense"
          (is (=? {:database (mt/id)}
                  expected-results)))
        (testing "Run the query a few of times so we know it's cached"
          (testing "first run"
            (is (= {:cached?  false
                    :num-rows 5}
                   (run-query))))
          (testing "should be cached now"
            (is (= {:cached?  true
                    :num-rows 5}
                   (run-query))))
          (testing "preprocess should return same results even when query was cached."
            (is (= expected-results
                   (qp.preprocess/preprocess query)))))))))

(driver/register! ::custom-escape-spaces-to-underscores :parent :h2)

(defmethod driver/escape-alias ::custom-escape-spaces-to-underscores
  [driver field-alias]
  (-> ((get-method driver/escape-alias :h2) driver field-alias)
      (str/replace #"\s" "_")))

(deftest ^:parallel query->expected-cols-test
  (testing "field_refs in expected columns have the original join aliases (#30648)"
    (mt/dataset test-data
      (binding [driver/*driver* ::custom-escape-spaces-to-underscores]
        (let [query
              (mt/mbql-query
                  products
                  {:joins
                   [{:source-query
                     {:source-table $$orders
                      :joins
                      [{:source-table $$people
                        :alias "People"
                        :condition [:= $orders.user_id &People.people.id]
                        :fields [&People.people.address]
                        :strategy :left-join}]
                      :fields [$orders.id &People.people.address]}
                     :alias "Question 54"
                     :condition [:= $id [:field %orders.id {:join-alias "Question 54"}]]
                     :fields [[:field %orders.id {:join-alias "Question 54"}]
                              [:field %people.address {:join-alias "Question 54"}]]
                     :strategy :left-join}]
                   :fields
                   [!default.created_at
                    [:field %orders.id {:join-alias "Question 54"}]
                    [:field %people.address {:join-alias "Question 54"}]]})]
          (is (=? [{:name "CREATED_AT"
                    :field_ref [:field (mt/id :products :created_at) {:temporal-unit :default}]
                    :display_name "Created At"}
                   {:name "ID"
                    :field_ref [:field (mt/id :orders :id) {:join-alias "Question 54"}]
                    :display_name "Question 54 → ID"
                    :source_alias "Question 54"}
                   {:name "ADDRESS"
                    :field_ref [:field (mt/id :people :address) {:join-alias "Question 54"}]
                    :display_name "Question 54 → Address"
                    :source_alias "Question 54"}]
                  (qp.preprocess/query->expected-cols query))))))))

(deftest ^:parallel deduplicate-column-names-test
  (testing "`query->expected-cols` should return deduplicated column names"
    (is (= ["ID" "DATE" "USER_ID" "VENUE_ID" "ID_2" "NAME" "LAST_LOGIN"]
           (map :name (qp.preprocess/query->expected-cols
                       (mt/mbql-query checkins
                         {:source-table $$checkins
                          :joins
                          [{:fields       :all
                            :alias        "u"
                            :source-table $$users
                            :condition    [:= $user_id &u.users.id]}]})))))))

(deftest ^:parallel remapped-fks-test
  (testing "Sanity check: query->expected-cols should not include MLv2 dimension remapping keys"
    ;; Add column remapping from Orders Product ID -> Products.Title
    (mt/with-temp [:model/Dimension _ (mt/$ids orders
                                               {:field_id                %product_id
                                                :name                    "Product ID"
                                                :type                    :external
                                                :human_readable_field_id %products.title})]
      (let [expected-cols (qp.preprocess/query->expected-cols (mt/mbql-query orders))]
        (is (not (some (some-fn :lib/external_remap :lib/internal_remap)
                       expected-cols)))))))
