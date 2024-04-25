(ns metabase.query-processor.middleware.add-rows-truncated-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-rows-truncated
    :as add-rows-truncated]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.test :as mt]))

(defn- add-rows-truncated [query rows]
  (let [rff (add-rows-truncated/add-rows-truncated query qp.reducible/default-rff)
        rf  (rff nil)]
    (transduce identity rf rows)))

(deftest ^:parallel add-rows-truncated-test
  (testing "the default behavior is to treat the query as no aggregation and use :max-results-bare-rows"
    (is (= {:status    :completed
            :row_count 5
            :data      {:rows           [[1] [1] [1] [1] [1]]
                        :rows_truncated 5}}
           (add-rows-truncated
            {:constraints {:max-results           10
                           :max-results-bare-rows 5}}
            [[1] [1] [1] [1] [1]])))))

(deftest ^:parallel add-rows-truncated-test-2
  (testing "when we aren't a no-aggregation query the then we use :max-results for our limit"
    (is (= {:status    :completed
            :row_count 5
            :data      {:rows [[1] [1] [1] [1] [1]]}}
           (add-rows-truncated
            {:query       {:aggregation [[:count]]}
             :constraints {:max-results           10
                           :max-results-bare-rows 5}}
            [[1] [1] [1] [1] [1]])))))

(deftest ^:parallel e2e-test
  (let [result         (qp/process-query
                        (-> (mt/mbql-query venues {:order-by [[:asc $id]]})
                            qp/userland-query
                            (assoc :constraints {:max-results-bare-rows 5
                                                 :max-result            10})))
        rows-truncated-info (select-keys (:data result) [:rows_truncated])]
    (is (= {:rows_truncated 5}
           (if (seq rows-truncated-info)
             rows-truncated-info
             result)))))
