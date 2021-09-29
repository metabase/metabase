(ns metabase.query-processor.middleware.limit-test
  "Tests for the `:limit` clause and `:max-results` constraints."
  (:require [clojure.test :refer :all]
            [metabase.query-processor.interface :as i]
            [metabase.query-processor.middleware.limit :as limit]
            [metabase.test :as mt]))

(def ^:private test-max-results 10000)

(defn- limit [query]
  (with-redefs [i/absolute-max-results test-max-results]
    (mt/test-qp-middleware limit/limit query (repeat (inc test-max-results) [:ok]))))

(deftest limit-results-rows-test
  (testing "Apply to an infinite sequence and make sure it gets capped at `i/absolute-max-results`"
    (is (= test-max-results
           (-> (limit {:type :native}) :post count)))))

(deftest max-results-constraint-test
  (testing "Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained"
    (is (= 1234
           (-> (limit {:constraints {:max-results 1234}
                       :type        :query
                       :query       {:aggregation [[:count]]}})
               :post count)))))

(deftest no-aggregation-test
  (testing "Apply a max-results-bare-rows limit specifically on no-aggregation query"
    (let [result (limit {:constraints {:max-results 46}
                         :type        :query
                         :query       {}})]
      (is (= 46
             (-> result :post count))
          "number of rows in results should match limit added by middleware")
      (is (= 46
             (-> result :metadata :row_count))
          ":row_count should match the limit added by middleware")
      (is (= 46
             (-> result :pre :query :limit))
          "Preprocessed query should have :limit added to it"))))
