(ns metabase.query-processor.middleware.add-rows-truncated-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.build :as qp.build]
            [metabase.query-processor.middleware.add-rows-truncated :as add-rows-truncated]
            [metabase.query-processor.util.reducible :as qp.util.reducible]))

(defn- add-rows-truncated [query rows]
  ((qp.build/sync-query-processor
    (qp.build/async-query-processor
     (qp.build/base-query-processor
      (fn [_ chans]
        (qp.util.reducible/mock-reducible-results {} rows chans))
      [add-rows-truncated/add-rows-truncated])
     500))
   query))

(deftest add-rows-truncated-test
  (testing "the default behavior is to treat the query as no aggregation and use :max-results-bare-rows"
    (is (= {:row_count 5
            :data      {:rows           [[1] [1] [1] [1] [1]]
                        :rows_truncated 5}}
           (add-rows-truncated
            {:constraints {:max-results           10
                           :max-results-bare-rows 5}}
            [[1] [1] [1] [1] [1]]))))
  (testing "when we aren't a no-aggregation query the then we use :max-results for our limit"
    (is (= {:row_count 5
            :data      {:rows [[1] [1] [1] [1] [1]]}}
           (add-rows-truncated
            {:query       {:aggregation [[:count]]}
             :constraints {:max-results           10
                           :max-results-bare-rows 5}}
            [[1] [1] [1] [1] [1]])))))
