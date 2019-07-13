(ns metabase.driver.druid.query-processor-test
  "Some tests to make sure the Druid Query Processor is generating sane Druid queries when compiling MBQL."
  (:require [metabase
             [driver :as driver]
             [query-processor :as qp]]
            [metabase.driver.druid.query-processor :as druid.qp]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.timeseries-query-processor-test.util :as tqpt]))

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
                   :filter
                   {:type  :not
                    :field {:type :selector, :dimension "id", :value nil}}
                   :aggregator {:type :count, :name "__count_0"}}]}
   :query-type  ::druid.qp/topN
   :mbql?       true}
  (query->native
   {:aggregation [[:* [:count $id] 10]]
    :breakout    [$venue_price]}))
