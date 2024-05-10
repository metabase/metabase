(ns metabase.pulse.body-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse :as pulse]
   [metabase.pulse.render.body :as body]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- render-card
  [render-type card data]
  (body/render render-type :attachment (pulse/defaulted-timezone card) card nil data))

(deftest render-cards-are-thread-safe-test-for-js-visualization
  (mt/with-temp [:model/Card card {:dataset_query          (mt/mbql-query orders
                                                                          {:aggregation [[:count]]
                                                                           :breakout    [$orders.created_at]
                                                                           :limit       1})
                                   :display                :line
                                   :visualization_settings {:graph.dimensions ["CREATED_AT"]
                                                            :graph.metrics    ["count"]}}]
    (let [data (:data (qp/process-query (:dataset_query card)))]
      (is (every? some? (map deref (for [_ (range 5)]
                                     (future #(render-card :javascript_visualization card data)))))))))

(deftest render-cards-are-thread-safe-test-for-table
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})
                                   :display       :table}]
    (let [data (:data (qp/process-query (:dataset_query card)))]
      (is (every? some? (map deref (for [_ (range 5)]
                                     (future #(render-card :table card data)))))))))
