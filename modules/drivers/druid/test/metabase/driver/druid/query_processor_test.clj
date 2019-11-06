(ns metabase.driver.druid.query-processor-test
  "Some tests to make sure the Druid Query Processor is generating sane Druid queries when compiling MBQL."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]]
            [metabase.driver.druid.query-processor :as druid.qp]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.timeseries-query-processor-test.util :as tqpt]
            [metabase.util.date :as du]))

(defn- str->absolute-dt [s]
  [:absolute-datetime (du/->Timestamp s "UTC") :default])

(deftest filter-intervals-test
  (let [dt-field                 [:datetime-field [:field-id 1] :default]
        filter-clause->intervals (comp (var-get #'druid.qp/compile-intervals) (var-get #'druid.qp/filter-clause->intervals))]
    (testing :=
      (is (= ["2015-10-04T00:00:00.000Z/2015-10-04T00:00:00.001Z"]
             (filter-clause->intervals [:= dt-field (str->absolute-dt "2015-10-04T00:00:00.000Z")]))
          ":= filters should get converted to intervals like `v/v+1`")
      (is (= nil
             (filter-clause->intervals [:= [:field-id 1] "toucan"]))
          "Non-temporal filter clauses should return `nil` intervals"))
    (testing :<
      (is (= ["-5000/2015-10-11T00:00:00.000Z"]
             (filter-clause->intervals [:<  dt-field (str->absolute-dt "2015-10-11T00:00:00.000Z")]))
          ":<, :<=, :>, and :>= should return an interval with -5000 or 5000 as min or max"))
    (testing :between
      (is (= ["2015-10-04T00:00:00.000Z/2015-10-20T00:00:00.001Z"]
             (filter-clause->intervals
              [:between dt-field (str->absolute-dt "2015-10-04T00:00:00.000Z") (str->absolute-dt "2015-10-20T00:00:00.000Z")]))))
    (testing :and
      (is (= ["2015-10-04T00:00:00.000Z/2015-10-11T00:00:00.000Z"]
             (filter-clause->intervals
              [:and
               [:>= dt-field (str->absolute-dt "2015-10-04T00:00:00.000Z")]
               [:<  dt-field (str->absolute-dt "2015-10-11T00:00:00.000Z")]]))
          "The Druid QP should be able to combine compound `:and` filter clauses into a single datetime interval.")
      (is (= ["2015-10-06T00:00:00.000Z/2015-10-20T00:00:00.001Z"]
             (filter-clause->intervals
              [:and
               [:between dt-field (str->absolute-dt "2015-10-04T00:00:00.000Z") (str->absolute-dt "2015-10-20T00:00:00.000Z")]
               [:between dt-field (str->absolute-dt "2015-10-06T00:00:00.000Z") (str->absolute-dt "2015-10-21T00:00:00.000Z")]]))
          "When two filters have overlapping intervals it should generate a single logically equivalent interval")
      (is (= nil
             (filter-clause->intervals
              [:and [:= [:field-id 1] "toucan"] [:= [:field-id 2] "threecan"]]))
          ":and clause should ignore non-temporal filters")
      (is (= ["2015-10-04T00:00:00.000Z/2015-10-04T00:00:00.001Z"]
             (filter-clause->intervals
              [:and
               [:= [:field-id 1] "toucan"] [:= dt-field (str->absolute-dt "2015-10-04T00:00:00.000Z")]]))
          ":and clause with no temporal filters should be compiled to `nil` interval")
      (is (= ["2015-10-04T00:00:00.000Z/2015-10-04T00:00:00.001Z"]
             (filter-clause->intervals
              [:and
               [:= dt-field (str->absolute-dt "2015-10-04T00:00:00.000Z")]
               [:or
                [:>= dt-field (str->absolute-dt "2015-10-03T00:00:00.000Z")]
                [:<  dt-field (str->absolute-dt "2015-10-11T00:00:00.000Z")]]]))
          ":and clause should ignore nested `:or` filters, since they can't be combined into a single filter"))
    (testing :or
      (is (= ["2015-10-04T00:00:00.000Z/5000" "-5000/2015-10-11T00:00:00.000Z"]
             (filter-clause->intervals
              [:or
               [:>= dt-field (str->absolute-dt "2015-10-04T00:00:00.000Z")]
               [:<  dt-field (str->absolute-dt "2015-10-11T00:00:00.000Z")]]))
          ":or filters should be combined into multiple intervals")
      (is (= ["2015-10-04T00:00:00.000Z/5000"]
             (filter-clause->intervals
              [:or
               [:>= dt-field (str->absolute-dt "2015-10-04T00:00:00.000Z")]
               [:= [:field-id 1] "toucan"]]))
          ":or clauses should ignore non-temporal filters")
      (is (= nil
             (filter-clause->intervals
              [:or
               [:= [:field-id 1] "toucan"]
               [:= [:field-id 2] "threecan"]]))
          ":or filters with no temporal filters should return nil"))))

(defn- do-query->native [query]
  (driver/with-driver :druid
    (tqpt/with-flattened-dbdef
      (with-redefs [druid.qp/random-query-id (constantly "<Query ID>")]
        (qp/query->native
          query)))))

(defmacro ^:private query->native [query]
  `(do-query->native
    (data/mbql-query ~'checkins
      ~query)))

(datasets/expect-with-driver :druid
  {:projections [:venue_price :__count_0 :expression]
   :query       {:queryType        :topN
                 :threshold        1000
                 :granularity      :all
                 :dataSource       "checkins"
                 :dimension        "venue_price"
                 :context          {:timeout 60000, :queryId "<Query ID>"}
                 :postAggregations [{:type   :arithmetic
                                     :name   "expression"
                                     :fn     :*
                                     :fields [{:type :fieldAccess, :fieldName "__count_0"}
                                              {:type :constant, :name "10", :value 10}]}]
                 :intervals        ["1900-01-01/2100-01-01"]
                 :metric           {:type :alphaNumeric}
                 :aggregations
                 [{:type       :filtered
                   :filter     {:type  :not
                                :field {:type :selector, :dimension "id", :value nil}}
                   :aggregator {:type :count, :name "__count_0"}}]}
   :query-type  ::druid.qp/topN
   :mbql?       true}
  (query->native
   {:aggregation [[:* [:count $id] 10]]
    :breakout    [$venue_price]}))

(datasets/expect-with-driver :druid
  {:projections [:venue_category_name :user_name :__count_0]
   :query       {:queryType    :groupBy
                 :granularity  :all
                 :dataSource   "checkins"
                 :dimensions   ["venue_category_name", "user_name"]
                 :context      {:timeout 60000, :queryId "<Query ID>"}
                 :intervals    ["1900-01-01/2100-01-01"]
                 :aggregations [{:type       :cardinality
                                 :name       "__count_0"
                                 :fieldNames ["venue_name"]
                                 :byRow      true
                                 :round      true}]
                 :limitSpec    {:type    :default
                                :columns [{:dimension "__count_0", :direction :descending}
                                          {:dimension "venue_category_name", :direction :ascending}
                                          {:dimension "user_name", :direction :ascending}]}}
   :query-type ::druid.qp/groupBy
   :mbql?      true}
  (query->native
   {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
    :breakout    [$venue_category_name $user_name]
    :order-by    [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]}))

(datasets/expect-with-driver :druid
  {:projections [:venue_category_name :user_name :__count_0]
   :query       {:queryType    :groupBy
                 :granularity  :all
                 :dataSource   "checkins"
                 :dimensions   ["venue_category_name", "user_name"]
                 :context      {:timeout 60000, :queryId "<Query ID>"}
                 :intervals    ["1900-01-01/2100-01-01"]
                 :aggregations [{:type       :cardinality
                                 :name       "__count_0"
                                 :fieldNames ["venue_name"]
                                 :byRow      true
                                 :round      true}]
                 :limitSpec    {:type    :default
                                :columns [{:dimension "__count_0", :direction :descending}
                                          {:dimension "venue_category_name", :direction :ascending}
                                          {:dimension "user_name", :direction :ascending}]
                                :limit   5}}
   :query-type  ::druid.qp/groupBy
   :mbql?       true}
  (query->native
   {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
    :breakout    [$venue_category_name $user_name]
    :order-by    [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]
    :limit       5}))

(datasets/expect-with-driver :druid
  {:projections [:venue_category_name :__count_0]
   :query       {:queryType    :topN
                 :threshold    1000
                 :granularity  :all
                 :dataSource   "checkins"
                 :dimension    "venue_category_name"
                 :context      {:timeout 60000, :queryId "<Query ID>"}
                 :intervals    ["1900-01-01/2100-01-01"]
                 :metric       "__count_0"
                 :aggregations [{:type       :cardinality
                                 :name       "__count_0"
                                 :fieldNames ["venue_name"]
                                 :byRow      true
                                 :round      true}]}
   :query-type  ::druid.qp/topN
   :mbql?       true}
  (query->native
   {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
    :breakout    [$venue_category_name]
    :order-by    [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]}))

;; `distinct` when used in post aggregations should have type `:finalizingFieldAccess`
(datasets/expect-with-driver :druid
  {:projections [:__distinct_0 :expression]
   :query       {:queryType        :timeseries
                 :granularity      :all
                 :dataSource       "checkins"
                 :context          {:timeout 60000, :queryId "<Query ID>"}
                 :intervals        ["1900-01-01/2100-01-01"]
                 :aggregations     [{:type       :cardinality
                                     :name       "__distinct_0"
                                     :fieldNames ["venue_name"]
                                     :byRow      true
                                     :round      true}]
                 :postAggregations [{:type :arithmetic,
                                     :name "expression",
                                     :fn :+,
                                     :fields
                                     [{:type :constant, :name "1", :value 1}
                                      {:type :finalizingFieldAccess, :fieldName "__distinct_0"}]}]}
   :query-type  ::druid.qp/total
   :mbql?       true}
  (query->native
   {:aggregation [[:+ 1 [:aggregation-options [:distinct $checkins.venue_name] {:name "__distinct_0"}]]]}))
