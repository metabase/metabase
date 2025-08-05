(ns metabase.search.semantic.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.engine :as search.engine]
   [metabase.search.semantic.core :as semantic.core]))

(def ^:private search-context
  {:query "test" :search-engine :search.engine/semantic})

(defn- with-search-engine-mocks!
  "Sets up search engine mocks for the semantic & appdb backends for testing fallback behavior.
   appdb-fn can be a collection of results or a function that takes a context."
  [semantic-results appdb-fn thunk]
  (let [semantic-results-fn (get-method search.engine/results :search.engine/semantic)]
    (with-redefs [semantic.core/results (constantly semantic-results)
                  search.engine/supported-engine? (constantly true)
                  search.engine/results (fn [ctx]
                                          (case (:search-engine ctx)
                                            :search.engine/appdb (if (fn? appdb-fn)
                                                                   (appdb-fn ctx)
                                                                   appdb-fn)
                                            :search.engine/semantic (semantic-results-fn ctx)))]
      (thunk))))

(defn- make-card-result
  "Creates a card result with the given id and name."
  [id name & {:keys [model score] :or {model "card"}}]
  (cond-> {:id id :name name :model model}
    score (assoc :score score)))

(deftest test-semantic-search-fallback-supplementation
  (testing "semantic search results below threshold are supplemented with appdb results"
    (binding [semantic.core/*min-results-threshold* 3]
      (let [semantic-result (make-card-result 1 "semantic-card" :score 0.9)
            appdb-results   [(make-card-result 1 "appdb-card-1")
                             (make-card-result 2 "appdb-card-2")
                             (make-card-result 3 "appdb-card-3")
                             (make-card-result 4 "appdb-dashboard" :model "dashboard")]
            search-ctx      search-context]
        (with-search-engine-mocks! [semantic-result] appdb-results
          (fn []
            (let [results (search.engine/results search-ctx)]
              (testing "semantic result comes first"
                (is (= semantic-result (first results))))

              (testing "appdb results are appended, and duplicate model/id pairs are removed"
                (is (= (rest appdb-results)
                       (rest results)))))))))))

(deftest test-semantic-search-above-threshold-no-fallback
  (testing "semantic search results above threshold are not supplemented"
    (binding [semantic.core/*min-results-threshold* 3]
      (let [semantic-results [(make-card-result 1 "semantic-card-1" :score 0.9)
                              (make-card-result 2 "semantic-card-2" :score 0.8)
                              (make-card-result 3 "semantic-card-3" :score 0.7)
                              (make-card-result 4 "semantic-card-4" :score 0.6)]
            search-ctx       search-context
            fallback-fn      (fn [ctx] (throw (ex-info "Should not call fallback engine" {:engine (:search-engine ctx)})))]
        (with-search-engine-mocks! semantic-results fallback-fn
          (fn []
            (let [results (search.engine/results search-ctx)]
              (testing "returns only semantic results without fallback"
                (is (= semantic-results results))
                (is (= 4 (count results)))))))))))

(deftest test-semantic-search-max-combined-results-limit
  (testing "combined results are limited by max-combined-results"
    (binding [semantic.core/*min-results-threshold* 3
              semantic.core/*max-combined-results* 5]
      (let [semantic-result (make-card-result 1 "semantic-card" :score 0.9)
            appdb-results   (for [i (range 2 10)]
                              (make-card-result i (str "appdb-card-" i)))
            search-ctx      search-context]
        (with-search-engine-mocks! [semantic-result] appdb-results
          (fn []
            (let [results (search.engine/results search-ctx)]
              (testing "semantic result is included first"
                (is (= semantic-result (first results))))
              (testing "remaining slots filled with appdb results"
                (let [remaining (rest results)]
                  (is (= 4 (count remaining)))
                  (is (every? #(contains? (set appdb-results) %) remaining)))))))))))
