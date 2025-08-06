(ns metabase-enterprise.semantic-search.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.appdb.core :as appdb]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.settings :as search.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures (compose-fixtures
               #'semantic.tu/once-fixture
               (fixtures/initialize :db)))

(deftest appdb-available-with-semantic
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [search.settings/search-engine "semantic"]
      (with-open [_ (semantic.tu/open-temp-index!)]
        (semantic.tu/cleanup-index-metadata! semantic.tu/db semantic.tu/mock-index-metadata)
        (search/init-index! {:force-reset? false, :re-populate? false})
        (is (search.engine/supported-engine? :search.engine/appdb))))))

(deftest api-engine-switching-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [search.settings/search-engine "semantic"]
      (with-open [_ (semantic.tu/open-temp-index!)]
        ;; Disable falling back to appdb search engine when not enough semantic results are returned
        (mt/with-temporary-setting-values [semantic-search-min-results-threshold 0]
          (testing "API defaults to semantic engine when configured"
            (let [semantic-called? (atom false)
                  appdb-called? (atom false)]
              (with-redefs [semantic.pgvector-api/query
                            (fn [& _]
                              (reset! semantic-called? true)
                              [{:id 1 :name "semantic-result" :model "card" :collection_id 1  :score 0}])
                            appdb/results
                            (fn [_]
                              (reset! appdb-called? true)
                              [{:id 2 :name "appdb-result" :model "card" :collection_id 1 :score 0.9}])]

                (let [response (mt/user-http-request :crowberto :get 200 "search" :q "test")]
                  (is @semantic-called? "Semantic search should be called by default")
                  (is (not @appdb-called?) "AppDB search should not be called by default")
                  (is (= "search.engine/semantic" (:engine response)))))))

          (testing "API can override engine with search_engine=appdb parameter"
            (let [semantic-called? (atom false)
                  appdb-called? (atom false)]
              (with-redefs [semantic.pgvector-api/query
                            (fn [& _]
                              (reset! semantic-called? true)
                              [{:id 1 :name "semantic-result" :model "card" :collection_id 1  :score 0.8}])
                            appdb/results
                            (fn [_]
                              (reset! appdb-called? true)
                              [{:id 2 :name "appdb-result" :model "card" :collection_id 1 :score 0.9}])]

                (let [response (mt/user-http-request :crowberto :get 200 "search" :q "test" :search_engine "appdb")]
                  (is (not @semantic-called?) "Semantic search should not be called when overridden")
                  (is @appdb-called? "AppDB search should be called when specified")
                  (is (= "search.engine/appdb" (:engine response))))))))))))

(def ^:private search-context
  {:query "test" :search-engine :search.engine/semantic})

(defn- with-search-engine-mocks!
  "Sets up search engine mocks for the semantic & appdb backends for testing fallback behavior.
   appdb-fn can be a collection of results or a function that takes a context."
  [semantic-results appdb-fn thunk]
  (with-redefs [semantic.pgvector-api/query (fn [_pgvector _index-metadata _search-ctx] semantic-results)
                search.engine/supported-engine? (constantly true)
                search.engine/results (fn [ctx]
                                        (case (:search-engine ctx)
                                          :search.engine/appdb (if (fn? appdb-fn)
                                                                 (appdb-fn ctx)
                                                                 appdb-fn)
                                          :search.engine/semantic (semantic.core/results ctx)))]
    (thunk)))

(defn- make-card-result
  "Creates a card result with the given id and name."
  [id name & {:keys [model score] :or {model "card"}}]
  (cond-> {:id id :name name :model model}
    score (assoc :score score)))

(deftest test-semantic-search-fallback-supplementation
  (testing "semantic search results below threshold are supplemented with appdb results"
    (mt/with-premium-features #{:semantic-search}
      (mt/with-temporary-setting-values [semantic-search-min-results-threshold 3]
        (let [semantic-result (make-card-result 1 "semantic-card" :score 0.9)
              appdb-results   [(make-card-result 1 "appdb-card-1")
                               (make-card-result 2 "appdb-card-2")
                               (make-card-result 3 "appdb-card-3")
                               (make-card-result 4 "appdb-dashboard" :model "dashboard")]
              search-ctx      search-context]
          (with-search-engine-mocks! [semantic-result] appdb-results
            (fn []
              (let [results (semantic.core/results search-ctx)]
                (testing "semantic result comes first"
                  (is (= semantic-result (first results))))

                (testing "appdb results are appended, and duplicate model/id pairs are removed"
                  (is (= (rest appdb-results)
                         (rest results))))))))))))

(deftest test-semantic-search-above-threshold-no-fallback
  (testing "semantic search results above threshold are not supplemented"
    (mt/with-premium-features #{:semantic-search}
      (mt/with-temporary-setting-values [semantic-search-min-results-threshold 3]
        (let [semantic-results [(make-card-result 1 "semantic-card-1" :score 0.9)
                                (make-card-result 2 "semantic-card-2" :score 0.8)
                                (make-card-result 3 "semantic-card-3" :score 0.7)
                                (make-card-result 4 "semantic-card-4" :score 0.6)]
              search-ctx       search-context
              fallback-fn      (fn [ctx] (throw (ex-info "Should not call fallback engine" {:engine (:search-engine ctx)})))]
          (with-search-engine-mocks! semantic-results fallback-fn
            (fn []
              (let [results (semantic.core/results search-ctx)]
                (testing "returns only semantic results without fallback"
                  (is (= semantic-results results))
                  (is (= 4 (count results))))))))))))

(deftest test-semantic-search-max-combined-results-limit
  (testing "combined results are limited by semantic-search-results-limit"
    (mt/with-premium-features #{:semantic-search}
      (mt/with-temporary-setting-values [semantic-search-min-results-threshold 3
                                         semantic-search-results-limit 5]
        (let [semantic-result (make-card-result 1 "semantic-card" :score 0.9)
              appdb-results   (for [i (range 2 10)]
                                (make-card-result i (str "appdb-card-" i)))
              search-ctx      search-context]
          (with-search-engine-mocks! [semantic-result] appdb-results
            (fn []
              (let [results (semantic.core/results search-ctx)]
                (testing "semantic result is included first"
                  (is (= semantic-result (first results))))
                (testing "remaining slots filled with appdb results"
                  (let [remaining (rest results)]
                    (is (= 4 (count remaining)))
                    (is (every? #(contains? (set appdb-results) %) remaining))))))))))))
