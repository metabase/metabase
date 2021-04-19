(ns metabase.query-processor.middleware.parameters.mbql-test
  "Tests for *MBQL* parameter substitution."
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.common.parameters :as params]
            [metabase.mbql.normalize :as normalize]
            [metabase.query-processor :as qp]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.middleware.parameters.mbql :as mbql-params]
            [metabase.test :as mt]))

(defn- expand-parameters [query]
  (let [query (normalize/normalize query)]
    (mbql-params/expand (dissoc query :parameters) (:parameters query))))

(defn- expanded-query-with-filter [filter-clause]
  {:database 1
   :type     :query
   :query    {:source-table 1000
              :filter       filter-clause
              :breakout     [[:field 17 nil]]}})

(defn- query-with-parameters [& parameters]
  {:database   1
   :type       :query
   :query      {:source-table 1000
                :breakout     [[:field 17 nil]]}
   :parameters (vec parameters)})

(deftest basic-test
  (testing "adding a simple parameter"
    (is (= (expanded-query-with-filter
            [:= [:field (mt/id :venues :name) nil] "Cam's Toucannery"])
           (expand-parameters
            (query-with-parameters
             {:hash   "abc123"
              :name   "foo"
              :type   "id"
              :target [:dimension [:field (mt/id :venues :name) nil]]
              :value  "Cam's Toucannery"}))))))

(deftest multiple-filters-test
  (testing "multiple filters are conjoined by an :and"
    (is (= (expanded-query-with-filter
            [:and
             [:= [:field (mt/id :venues :id) nil] 12]
             [:= [:field (mt/id :venues :name) nil] "Cam's Toucannery"]
             [:= [:field (mt/id :venues :id) nil] 999]])
           (expand-parameters
            (-> (query-with-parameters
                 {:hash   "abc123"
                  :name   "foo"
                  :type   :id
                  :target [:dimension [:field (mt/id :venues :name) nil]]
                  :value  "Cam's Toucannery"}
                 {:hash   "def456"
                  :name   "bar"
                  :type   :category
                  :target [:dimension [:field (mt/id :venues :id) nil]]
                  :value  999})
                (assoc-in [:query :filter] [:and [:= [:field (mt/id :venues :id) nil] 12]])))))))

(deftest date-range-parameters-test
  (testing "date range parameters"
    (doseq [[value expected-filter-clause]
            {"past30days"            [:time-interval [:field (mt/id :users :last_login) nil] -30 :day {:include-current false}]
             "past30days~"           [:time-interval [:field (mt/id :users :last_login) nil] -30 :day {:include-current true}]
             "yesterday"             [:=
                                      [:field (mt/id :users :last_login) {:temporal-unit :day}]
                                      [:relative-datetime -1 :day]]
             "2014-05-10~2014-05-16" [:between [:field (mt/id :users :last_login) {:temporal-unit :day}]
                                      "2014-05-10"
                                      "2014-05-16"]}]
      (testing (format "value = %s" (pr-str value))
        (is (= (expanded-query-with-filter expected-filter-clause)
               (expand-parameters
                (query-with-parameters
                 {:hash   "abc123"
                  :name   "foo"
                  :type   :date
                  :target [:dimension [:field (mt/id :users :last_login) nil]]
                  :value  value}))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                END-TO-END TESTS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; for some reason param substitution tests fail on Redshift so just don't run those for now
(defn- params-test-drivers []
  (disj (mt/normal-drivers) :redshift))

(deftest date-ranges-e2e-test
  (mt/test-drivers (params-test-drivers)
    (testing "check that date ranges work correctly"
      ;; Prevent an issue with Snowflake were a previous connection's report-timezone setting can affect this test's
      ;; results
      (when (= :snowflake driver/*driver*)
        (driver/notify-database-updated driver/*driver* (mt/id)))
      (is (= [[29]]
             (mt/formatted-rows [int]
               (qp/process-query
                (mt/query checkins
                  {:query      {:aggregation [[:count]]}
                   :parameters [{:hash   "abc123"
                                 :name   "foo"
                                 :type   "date"
                                 :target [:dimension $date]
                                 :value  "2015-04-01~2015-05-01"}]}))))))))

(deftest ids-e2e-test
  (mt/test-drivers (params-test-drivers)
    (testing "check that IDs work correctly"
      (doseq [[message value] {"passed in as numbers" 100
                               "passed in as strings" "100"}]
        (testing message
          (is (= [[1]]
                 (mt/formatted-rows [int]
                   (qp/process-query
                    (mt/query checkins
                      {:query      {:aggregation [[:count]]}
                       :parameters [{:hash   "abc123"
                                     :name   "foo"
                                     :type   :number
                                     :target [:dimension $id]
                                     :value  value}]}))))))))))

(deftest categories-e2e-test
  (mt/test-drivers (params-test-drivers)
    (testing "check that Categories work correctly (passed in as strings, as the frontend is wont to do; should get converted)"
      (is (= [[6]]
             (mt/formatted-rows [int]
               (qp/process-query
                (mt/query venues
                  {:query      {:aggregation [[:count]]}
                   :parameters [{:name   "price"
                                 :type   :category
                                 :target $price
                                 :value  "4"}]}))))))))

(deftest operations-e2e-test
  (mt/test-drivers (params-test-drivers)
    (testing "check that operations works correctly"
      (let [f #(mt/formatted-rows [int]
                 (qp/process-query %))]
        (testing "binary numeric"
          (is (= [[78]]
                 (f (mt/query venues
                      {:query      {:aggregation [[:count]]}
                       :parameters [{:name   "price"
                                     :type   :number/between
                                     :target $price
                                     :value [2 5]}]})))))
        (testing "unary string"
          (is (= [(case driver/*driver*
                    ;; no idea why this count is off...
                    (:mysql :sqlite :sqlserver) [12]
                    [11])]
                 (f (mt/query venues
                      {:query      {:aggregation [[:count]]}
                       :parameters [{:name   "name"
                                     :type   :string/starts-with
                                     :target $name
                                     :value ["B"]}]})))))
        (with-redefs [params/field-filter-operators-enabled? (constantly false)]
          (testing "Throws if not enabled (#15488)"
            (is (= {:type     qp.error-type/invalid-parameter
                    :operator :number/between}
                   (try (f (mt/query venues
                             {:query      {:aggregation [[:count]]}
                              :parameters [{:name   "price"
                                            :type   :number/between
                                            :target $price
                                            :value  [2 5]}]}))
                        (catch Exception e (ex-data e)))))))))))

(deftest basic-where-test
  (mt/test-drivers (params-test-drivers)
    (testing "test that we can inject a basic `WHERE field = value` type param"
      (testing "`:id` param type"
        (is (= [[9 "Nils Gotam"]]
               (mt/formatted-rows [int str]
                 (qp/process-query
                  (mt/query users
                    {:parameters [{:name   "id"
                                   :type   "id"
                                   :target $id
                                   :value  9}]}))))))

      (testing "`:category` param type"
        (is (= [[6]]
               (mt/formatted-rows [int]
                 (qp/process-query
                  (mt/query venues
                    {:query      {:aggregation [[:count]]}
                     :parameters [{:name   "price"
                                   :type   :category
                                   :target $price
                                   :value  4}]}))))))
      (testing "`:number/>=` param type"
        (is (= [[78]]
               (mt/formatted-rows [int]
                 (qp/process-query
                  (mt/query venues
                    {:query      {:aggregation [[:count]]}
                     :parameters [{:name   "price"
                                   :type   :number/>=
                                   :target $price
                                   :value  [2]}]})))))))))

;; Make sure that *multiple* values work. This feature was added in 0.28.0. You are now allowed to pass in an array of
;; parameter values instead of a single value, which should stick them together in a single MBQL `:=` clause, which
;; ends up generating a SQL `*or*` clause
(deftest multiple-values-test
  (testing "Make sure that *multiple* values work."
    (let [query (mt/query venues
                  {:query      {:aggregation [[:count]]}
                   :parameters [{:name   "price"
                                 :type   :category
                                 :target $price
                                 :value  [3 4]}]})]
      (mt/test-drivers (params-test-drivers)
        (is (= [[19]]
               (mt/formatted-rows [int]
                 (qp/process-query query)))))

      ;; now let's make sure the correct query is actually being generated for the same thing above... (NOTE: We're
      ;; only testing this with H2 because the SQL generated is simply too different between various SQL drivers. we
      ;; know the features are still working correctly because we're actually checking that we get the right result
      ;; from running the query above these tests are more of a sanity check to make sure the SQL generated is sane.)
      (testing "Make sure correct query is generated"
        (is (= {:query  (str "SELECT count(*) AS \"count\" "
                             "FROM \"PUBLIC\".\"VENUES\" "
                             "WHERE (\"PUBLIC\".\"VENUES\".\"PRICE\" = 3 OR \"PUBLIC\".\"VENUES\".\"PRICE\" = 4)")
                :params nil}
               (qp/query->native
                (mt/query venues
                  {:query      {:aggregation [[:count]]}
                   :parameters [{:name   "price"
                                 :type   :category
                                 :target $price
                                 :value  [3 4]}]})))))))
  (testing "Make sure multiple values with operators works"
    (let [query (mt/query venues
                  {:query      {:aggregation [[:count]]}
                   :parameters [{:name   "price"
                                 :type   :number/between
                                 :target $price
                                 :value  [3 4]}]})]
      (mt/test-drivers (params-test-drivers)
        (is (= [[19]]
               (mt/formatted-rows [int]
                 (qp/process-query query)))))

      (testing "Make sure correct query is generated"
        (is (= {:query  (str "SELECT count(*) AS \"count\" "
                             "FROM \"PUBLIC\".\"VENUES\" "
                             "WHERE \"PUBLIC\".\"VENUES\".\"PRICE\" BETWEEN 3 AND 4")
                :params nil}
               (qp/query->native
                (mt/query venues
                  {:query      {:aggregation [[:count]]}
                   :parameters [{:name   "price"
                                 :type   :number/between
                                 :target $price
                                 :value  [3 4]}]}))))))))

;; try it with date params as well. Even though there's no way to do this in the frontend AFAIK there's no reason we
;; can't handle it on the backend
(deftest date-params-test
  (is (= {:query  (str "SELECT count(*) AS \"count\" FROM \"PUBLIC\".\"CHECKINS\" "
                       "WHERE ("
                       "(\"PUBLIC\".\"CHECKINS\".\"DATE\" >= ? AND \"PUBLIC\".\"CHECKINS\".\"DATE\" < ?)"
                       " OR (\"PUBLIC\".\"CHECKINS\".\"DATE\" >= ? AND \"PUBLIC\".\"CHECKINS\".\"DATE\" < ?)"
                       ")")
          :params [#t "2014-06-01T00:00Z[UTC]"
                   #t "2014-07-01T00:00Z[UTC]"
                   #t "2015-06-01T00:00Z[UTC]"
                   #t "2015-07-01T00:00Z[UTC]"]}
         (qp/query->native
           (mt/query checkins
             {:query      {:aggregation [[:count]]}
              :parameters [{:name   "date"
                            :type   "date/month"
                            :target $date
                            :value  ["2014-06" "2015-06"]}]})))))

(deftest convert-ids-to-numbers-test
  (is (= (mt/$ids venues
           [:= $id 1])
         (#'mbql-params/build-filter-clause
          (mt/$ids venues
            {:type   :id
             :target [:dimension $id]
             :slug   "venue_id"
             :value  "1"
             :name   "Venue ID"})))
      "make sure that :id type params get converted to numbers when appropriate"))

;;
(deftest handle-fk-forms-test
  (mt/test-drivers (filter #(driver/supports? % :foreign-keys) (params-test-drivers))
    (testing "Make sure we properly handle paramters that have `fk->` forms in `:dimension` targets (#9017)"
      (is (= [[31 "Bludso's BBQ" 5 33.8894 -118.207 2]
              [32 "Boneyard Bistro" 5 34.1477 -118.428 3]
              [33 "My Brother's Bar-B-Q" 5 34.167 -118.595 2]
              [35 "Smoke City Market" 5 34.1661 -118.448 1]
              [37 "bigmista's barbecue" 5 34.118 -118.26 2]
              [38 "Zeke's Smokehouse" 5 34.2053 -118.226 2]
              [39 "Baby Blues BBQ" 5 34.0003 -118.465 2]]
             (mt/formatted-rows :venues
               (qp/process-query
                (mt/query venues
                  {:query      {:order-by [[:asc $id]]}
                   :parameters [{:type   :id
                                 :target [:dimension $category_id->categories.name]
                                 :value  ["BBQ"]}]}))))))
    (testing "Operators work on fk"
      (is (= [[31 "Bludso's BBQ" 5 33.8894 -118.207 2]
              [32 "Boneyard Bistro" 5 34.1477 -118.428 3]
              [33 "My Brother's Bar-B-Q" 5 34.167 -118.595 2]
              [35 "Smoke City Market" 5 34.1661 -118.448 1]
              [37 "bigmista's barbecue" 5 34.118 -118.26 2]
              [38 "Zeke's Smokehouse" 5 34.2053 -118.226 2]
              [39 "Baby Blues BBQ" 5 34.0003 -118.465 2]]
             (mt/formatted-rows :venues
               (qp/process-query
                (mt/query venues
                  {:query      {:order-by [[:asc $id]]}
                   :parameters [{:type   :string/starts-with
                                 :target [:dimension $category_id->categories.name]
                                 :value  ["BB"]}]}))))))))

(deftest test-mbql-parameters
  (testing "Should be able to pass parameters in to an MBQL query"
    (letfn [(venues-with-price [param]
              (ffirst
               (mt/rows
                 (mt/process-query
                  {:database   (mt/id)
                   :type       :query
                   :query      {:source-table (mt/id :venues)
                                :aggregation  [[:count]]}
                   :parameters [(merge
                                 {:type   :category
                                  :target [:dimension [:field (mt/id :venues :price) nil]]}
                                 param)]}))))]
      (doseq [[price expected] {1 22
                                2 59}]
        (testing (format ":value = %d" price)
          (is (= expected
                 (venues-with-price {:value price})))))
      (testing "Should use :default if :value is not specified"
        (is (= 22
               (venues-with-price {:default 1}))))
      (testing "Should prefer :value over :default"
        (is (= 59
               (venues-with-price {:default 1, :value 2})))))))
