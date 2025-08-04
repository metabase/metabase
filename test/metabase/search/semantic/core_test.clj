(ns metabase.search.semantic.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.engine :as search.engine]
   [metabase.search.semantic.core :as semantic.core]))

(deftest test-semantic-search-fallback-supplementation
  (testing "semantic search results below threshold are supplemented with appdb results"
    (binding [semantic.core/*min-results-threshold* 3]
      (let [semantic-result     {:id 1 :name "semantic-card" :model "card" :score 0.9}
            appdb-results       [{:id 2 :name "appdb-card-1" :model "card"}
                                 {:id 3 :name "appdb-card-2" :model "card"}
                                 {:id 4 :name "appdb-dashboard" :model "dashboard"}]
            search-ctx          {:query "test" :search-engine :search.engine/semantic}
            semantic-results-fn (get-method search.engine/results :search.engine/semantic)]
        (with-redefs [semantic.core/results (constantly [semantic-result])
                      search.engine/supported-engine? (constantly true)
                      search.engine/results (fn [ctx]
                                              (case (:search-engine ctx)
                                                :search.engine/appdb appdb-results
                                                :search.engine/semantic (semantic-results-fn ctx)))]

          (let [results (search.engine/results search-ctx)]
            (testing "semantic result comes first"
              (is (= semantic-result (first results))))

            (testing "appdb results are appended"
              (is (= appdb-results (rest results))))))))))

(deftest test-semantic-search-above-threshold-no-fallback
  (testing "semantic search results above threshold are not supplemented"
    (binding [semantic.core/*min-results-threshold* 3]
      (let [semantic-results [{:id 1 :name "semantic-card-1" :model "card" :score 0.9}
                              {:id 2 :name "semantic-card-2" :model "card" :score 0.8}
                              {:id 3 :name "semantic-card-3" :model "card" :score 0.7}
                              {:id 4 :name "semantic-card-4" :model "card" :score 0.6}]
            search-ctx         {:query "test" :search-engine :search.engine/semantic}
            semantic-results-fn (get-method search.engine/results :search.engine/semantic)]
        (with-redefs [semantic.core/results (constantly semantic-results)
                      search.engine/supported-engine? (constantly true)
                      search.engine/results (fn [ctx]
                                              (case (:search-engine ctx)
                                                :search.engine/semantic (semantic-results-fn ctx)
                                                (throw (ex-info "Should not call fallback engine" {:engine (:search-engine ctx)}))))]

          (let [results (search.engine/results search-ctx)]
            (testing "returns only semantic results without fallback"
              (is (= semantic-results results))
              (is (= 4 (count results))))))))))

(deftest test-semantic-search-max-combined-results-limit
  (testing "combined results are limited by max-combined-results"
    (binding [semantic.core/*min-results-threshold* 3
              semantic.core/*max-combined-results* 5]
      (let [semantic-result {:id 1 :name "semantic-card" :model "card" :score 0.9}
            appdb-results (for [i (range 2 10)]
                            {:id i :name (str "appdb-card-" i) :model "card"})
            search-ctx         {:query "test" :search-engine :search.engine/semantic}
            semantic-results-fn (get-method search.engine/results :search.engine/semantic)]
        (with-redefs [semantic.core/results (constantly [semantic-result])
                      search.engine/supported-engine? (constantly true)
                      search.engine/results (fn [ctx]
                                              (case (:search-engine ctx)
                                                :search.engine/appdb appdb-results
                                                :search.engine/semantic (semantic-results-fn ctx)))]

          (let [results (search.engine/results search-ctx)]
            (testing "semantic result is included first"
              (is (= semantic-result (first results))))

            (testing "remaining slots filled with appdb results"
              (let [remaining (rest results)]
                (is (= 4 (count remaining)))
                (is (every? #(contains? (set appdb-results) %) remaining))))))))))
