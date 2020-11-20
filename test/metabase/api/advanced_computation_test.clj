(ns metabase.api.advanced-computation-test
  "Unit tests for /api/advanced_computation endpoints."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private query-defaults
  {:middleware {:add-default-userland-constraints? true
                :js-int-to-string?                 true}})

(deftest pivot-dataset-test
  (mt/dataset sample-dataset
    (testing "POST /api/advanced_computation/pivot/dataset"
      (testing "Run a pivot table"
        (let [result  ((mt/user->client :rasta) :post 200 "advanced_computation/pivot/dataset" (mt/mbql-query orders
                                                                                                              {:aggregation [[:count] [:sum $orders.quantity]]
                                                                                                               :breakout    [[:fk-> $orders.user_id $people.state]
                                                                                                                             [:fk-> $orders.user_id $people.source]
                                                                                                                             [:fk-> $orders.product_id $products.category]]}))]
          (is (= [{:data                   {:rows             [[1000]]
                                            :cols             [(tu/obj->json->obj (qp.test/aggregate-col :count))]
                                            :native_form      true
                                            :results_timezone "UTC"}
                   :row_count              1
                   :status                 "completed"
                   :context                "ad-hoc"
                   :json_query             (-> (mt/mbql-query orders
                                                              {:aggregation [[:count]]})
                                               (assoc-in [:query :aggregation] [["count"]])
                                               (assoc :type "query")
                                               (merge query-defaults))
                   :started_at             true
                   :running_time           true
                   :average_execution_time nil
                   :database_id            (mt/id)}]
                 result)))))))
