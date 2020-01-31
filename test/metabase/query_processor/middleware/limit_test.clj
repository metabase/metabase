(ns metabase.query-processor.middleware.limit-test
  "Tests for the `:limit` clause and `:max-results` constraints."
  (:require [clojure.test :refer :all]
            [metabase.query-processor
             [build :as qp.build]
             [interface :as i]]
            [metabase.query-processor.middleware.limit :as limit]))

(defn- limit [query]
  ((qp.build/sync-query-processor
    (qp.build/async-query-processor
     (qp.build/base-query-processor
      (fn [_ query _ results-fn]
        (results-fn query (repeat [:ok])))
      [limit/limit])))
   query))

(deftest limit-results-rows-test
  (testing "Apply to an infinite sequence and make sure it gets capped at `i/absolute-max-results`"
    (is (= i/absolute-max-results
           (-> (limit {:type :native}) :data :rows count)))))

(deftest max-results-constraint-test
  (testing "Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained"
    (is (= 1234
           (-> (limit {:constraints {:max-results 1234}
                       :type        :query
                       :query       {:aggregation [[:count]]}})
               :data :rows count)))))

(deftest no-aggregation-test
  (testing "Apply a max-results-bare-rows limit specifically on no-aggregation query"
    (let [result (limit {:constraints {:max-results 46}
                         :type        :query
                         :query       {}
                         :rows        (repeat [:ok])})]
      (is (= 46
             (-> result :data :rows count)
             (-> result :row_count)
             (-> result :data :query :limit))))))
