(ns metabase-enterprise.semantic-search.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.core :as appdb]
   [metabase.search.engine :as search.engine]
   [metabase.search.in-place.legacy :as in-place.legacy]
   [metabase.search.in-place.scoring :as in-place.scoring]
   [metabase.search.settings :as search.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (compose-fixtures
                     (fixtures/initialize :db)
                     #'semantic.tu/once-fixture))

(deftest fallback-engine-available-with-semantic-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [search.settings/search-engine "semantic"]
      (with-open [_ (semantic.tu/open-temp-index!)]
        (semantic.tu/cleanup-index-metadata! semantic.tu/db semantic.tu/mock-index-metadata)
        (semantic.tu/with-index!
          (is (search.engine/supported-engine? (if (= :mysql (mdb/db-type))
                                                 ;; appdb is not supported on :mysql, should fallback to in-place
                                                 :search.engine/in-place
                                                 :search.engine/appdb))))))))

(deftest api-engine-switching-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [search.settings/search-engine "semantic"]
      (with-open [_ (semantic.tu/open-temp-index!)]
        ;; Disable falling back to appdb / in-place search engine when not enough semantic results are returned
        (mt/with-temporary-setting-values [semantic-search-min-results-threshold 0]
          (let [semantic-called? (atom false)
                appdb-called? (atom false)
                legacy-called? (atom false)
                reset-called-atoms! #(do (reset! semantic-called? false)
                                         (reset! appdb-called? false)
                                         (reset! legacy-called? false))]
            (with-redefs [semantic.pgvector-api/query
                          (fn [& _]
                            (reset! semantic-called? true)
                            {:results [{:id 1 :name "semantic-result" :model "card" :collection_id 1  :score 0}]
                             :raw-count 0})
                          appdb/results
                          (fn [_]
                            (reset! appdb-called? true)
                            [{:id 2 :name "appdb-result" :model "card" :collection_id 1 :score 0.9}])
                          in-place.scoring/score-and-result
                          (fn [result _]
                            {:result (dissoc result :score)
                             :score  (:score result)})
                          in-place.legacy/results
                          (fn [_]
                            (reset! legacy-called? true)
                            [{:id 2 :name "legacy-result" :model "card" :collection_id 1 :score 0.7}])]
              (testing "API defaults to semantic engine when configured"
                (let [response (mt/user-http-request :crowberto :get 200 "search" :q "test")]
                  (is @semantic-called? "Semantic search should be called by default")
                  (is (not @appdb-called?) "AppDB search should not be called by default")
                  (is (not @legacy-called?) "Legacy search should not be called by default")
                  (is (= "search.engine/semantic" (:engine response)))))
              (reset-called-atoms!)
              (testing "API can override engine with search_engine parameter"
                (when (search.engine/supported-engine? :search.engine/appdb)
                  (let [response (mt/user-http-request :crowberto :get 200 "search" :q "test" :search_engine "appdb")]
                    (is (= "search.engine/appdb" (:engine response)))
                    (is @appdb-called? "AppDB search should be called when specified")
                    (is (not @semantic-called?) "Semantic search should not be called when overridden")
                    (is (not @legacy-called?) "Legacy search should not be called when overridden")))
                (reset-called-atoms!)
                (when (search.engine/supported-engine? :search.engine/in-place)
                  (let [response (mt/user-http-request :crowberto :get 200 "search" :q "test" :search_engine "in-place")]
                    (is (= "search.engine/in-place" (:engine response)))
                    (is @legacy-called? "Legacy search should be called when specified")
                    (is (not @semantic-called?) "Semantic search should not be called when overridden")
                    (is (not @appdb-called?) "AppDB search should not be called when overridden")))))))))))

(def ^:private search-context
  {:search-string "test" :search-engine :search.engine/semantic})

(defn- with-search-engine-mocks!
  "Sets up search engine mocks for the semantic & appdb backends for testing fallback behavior.
   appdb-fn can be a collection of results or a function that takes a context."
  [semantic-results appdb-results thunk]
  (with-redefs [semantic.pgvector-api/query (fn [_pgvector _index-metadata _search-ctx]
                                              (if (map? semantic-results)
                                                semantic-results
                                                {:results semantic-results
                                                 ;; Set raw-count to a non-zero value to ensure fallback logic is
                                                 ;; triggered
                                                 :raw-count 1}))
                search.engine/results (fn [ctx]
                                        (case (:search-engine ctx)
                                          :search.engine/appdb (if (fn? appdb-results)
                                                                 (appdb-results ctx)
                                                                 appdb-results)
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

(deftest test-semantic-search-fallback-failure-resilient
  (testing "semantic search is resilient to fallback engine failure"
    (mt/with-premium-features #{:semantic-search}
      (mt/with-temporary-setting-values [semantic-search-min-results-threshold 3]
        (let [semantic-result (make-card-result 1 "semantic-card" :score 0.9)
              search-ctx      search-context]
          (with-search-engine-mocks! [semantic-result] (fn [_] (throw (ex-info "Fallback fail" {})))
            (fn []
              (let [results (into [] (semantic.core/results search-ctx))]
                (is (= [semantic-result] results))))))))))

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

(deftest test-semantic-search-fallback-empty-or-nil-search-string
  (testing "fallback to backup search engine if :search-string is empty or nil"
    (mt/with-premium-features #{:semantic-search}
      (let [semantic-results {:results [] :raw-count 0}
            appdb-results    [(make-card-result 1 "appdb-card-1")]
            search-ctx       search-context]
        (with-search-engine-mocks! semantic-results appdb-results
          (fn []
            (testing ":search-string is nil"
              (let [results (semantic.core/results (assoc search-ctx :search-string nil))]
                (is (= appdb-results results))))
            (testing ":search-string is empty"
              (let [results (semantic.core/results (assoc search-ctx :search-string ""))]
                (is (= appdb-results results))))))))))
