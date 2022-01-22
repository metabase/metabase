(ns metabase.query-processor.middleware.limit-test
  "Tests for the `:limit` clause and `:max-results` constraints."
  (:require [clojure.test :refer :all]
            [metabase.query-processor.interface :as i]
            [metabase.query-processor.middleware.limit :as limit]
            [metabase.test :as mt]
            [metabase.query-processor.context.default :as context.default]))

(def ^:private test-max-results 10000)

(defn- limit [query]
  (with-redefs [i/absolute-max-results test-max-results]
    (let [rff (limit/limit-result-rows query context.default/default-rff)]
      (transduce identity (rff {}) (repeat (inc test-max-results) [:ok])))))

(deftest limit-results-rows-test
  (testing "Apply to an infinite sequence and make sure it gets capped at `i/absolute-max-results`"
    (is (= test-max-results
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
    (let [query  {:constraints {:max-results 46}
                  :type        :query
                  :query       {}}
          result (limit query)]
      (testing "number of rows in results should match limit added by middleware"
        (is (= 46
               (-> result :data :rows count))))
      (testing ":row_count should match the limit added by middleware"
        (is (partial= {:row_count 46}
                      result)))
      (testing "Preprocessed query should have :limit added to it"
        (is (partial= {:query {:limit 46}}
                      (limit/add-default-limit query)))))))
