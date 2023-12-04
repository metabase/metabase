(ns metabase.query-processor-test
  "Helper functions for various query processor tests. The tests themselves can be found in various
  `metabase.query-processor-test.*` namespaces; there are so many that it is no longer feasible to keep them all in
  this one. Event-based DBs such as Druid are tested in `metabase.driver.event-query-processor-test`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest preprocess-caching-test
  (testing "`preprocess` should work the same even if query has cached results (#18579)"
    ;; make a copy of the `test-data` DB so there will be no cache entries from previous test runs possibly affecting
    ;; this test.
    (mt/with-temp-copy-of-db
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (let [query            (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                                      :cache-ttl 10)
              run-query        (fn []
                                 (let [results (qp/process-query query)]
                                   {:cached?  (boolean (:cached (:cache/details results)))
                                    :num-rows (count (mt/rows results))}))
              expected-results (qp/preprocess query)]
          (testing "Check preprocess before caching to make sure results make sense"
            (is (=? {:database (mt/id)}
                    expected-results)))
          (testing "Run the query a few of times so we know it's cached"
            (testing "first run"
              (is (= {:cached?  false
                      :num-rows 5}
                     (run-query))))
            ;; run a few more times to make sure stuff got a chance to be cached.
            (run-query)
            (run-query)
            (testing "should be cached now"
              (is (= {:cached?  true
                      :num-rows 5}
                     (run-query))))
            (testing "preprocess should return same results even when query was cached."
              (is (= expected-results
                     (qp/preprocess query))))))))))

(driver/register! ::custom-escape-spaces-to-underscores :parent :h2)

(defmethod driver/escape-alias ::custom-escape-spaces-to-underscores
  [driver field-alias]
  (-> ((get-method driver/escape-alias :h2) driver field-alias)
      (str/replace #"\s" "_")))

(deftest ^:parallel query->expected-cols-test
  (testing "field_refs in expected columns have the original join aliases (#30648)"
    (mt/dataset sample-dataset
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
                  (qp/query->expected-cols query))))))))
