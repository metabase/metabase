(ns metabase-enterprise.metabot-v3.tools.semantic-search-test
  "Semantic search tests specific to the Metabot search tool integration."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.search :as search]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search-core]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :once #'semantic.tu/once-fixture)

(defmacro with-semantic-search-if-available! [mock-embeddings & body]
  `(mt/with-additional-premium-features #{:semantic-search}
     (when (search.engine/supported-engine? :search.engine/semantic)
       (semantic.tu/with-mock-embeddings ~mock-embeddings
         (binding [search.ingestion/*disable-updates* false
                   search.ingestion/*force-sync* true]
           ~@body)))))

(defmacro with-and-without-semantic-search! [mock-embeddings & body]
  `(do ~@body (with-semantic-search-if-available! ~mock-embeddings ~@body)))

(deftest search-test
  (mt/with-additional-premium-features #{:content-verification}
    (with-semantic-search-if-available!
      (mt/with-test-user :rasta
        (let [order-table {:id 1
                           :model "table"
                           :table_name "orders"
                           :name "Orders"
                           :description "Order table"
                           :database_id 42
                           :table_schema "public"}
              dashboard {:id 2
                         :model "dashboard"
                         :name "Sales Dashboard"
                         :description "Dashboard for sales"
                         :verified true}]

          (with-redefs [perms/impersonated-user? (fn [] false)
                        perms/sandboxed-user? (fn [] false)
                        api/*current-user-id* 1]

            (testing "search returns postprocessed results for term queries"
              (with-redefs [search-core/search (fn [_] {:data [order-table]})]
                (let [args {:term-queries ["orders"]
                            :entity-types ["table"]}
                      results (search/search args)
                      expected [(#'search/postprocess-search-result order-table)]]
                  (is (= expected results)))))

            (testing "search returns postprocessed results for semantic queries"
              (with-redefs [search-core/search (fn [_] {:data [dashboard]})]
                (let [args {:semantic-queries ["sales metrics"]
                            :entity-types ["dashboard"]}
                      results (search/search args)
                      expected [(#'search/postprocess-search-result dashboard)]]
                  (is (= expected results)))))

            (testing "search combines term and semantic queries using RRF"
              (with-redefs [search-core/search (fn [context]
                                                 (if (= (:search-string context) "orders")
                                                   {:data [order-table]}
                                                   {:data [dashboard]}))]
                (let [args {:term-queries ["orders"]
                            :semantic-queries ["sales"]
                            :entity-types ["table" "dashboard"]}
                      results (search/search args)]
                   ;; Should return both results combined via RRF
                  (is (= 2 (count results)))
                  (is (some #(= (:id %) 1) results))
                  (is (some #(= (:id %) 2) results)))))

            (testing "search applies RRF to overlapping results"
              (with-redefs [search-core/search (fn [_]
                                                 {:data [order-table dashboard]})]
                (let [args {:term-queries ["orders" "sales"]
                            :entity-types ["table" "dashboard"]}
                      results (search/search args)]
                   ;; Both queries return same results, RRF should boost them
                  (is (= 2 (count results)))
                  (is (some #(= (:id %) 1) results))
                  (is (some #(= (:id %) 2) results)))))

            (testing "search handles empty results"
              (with-redefs [search-core/search (fn [_] {:data []})]
                (let [args {:term-queries ["nonexistent"]
                            :entity-types ["table"]}
                      results (search/search args)]
                  (is (empty? results)))))

            (testing "search with metabot verified content flag"
              (let [metabot {:entity_id "test-bot"
                             :use_verified_content true}]
                (with-redefs [t2/select-one (fn [model & _]
                                              (is (= :model/Metabot model) "Should query for Metabot model")
                                              metabot)
                              search-core/search (fn [context]
                                                   ;; Verify that verified flag is set when metabot has use_verified_content
                                                   (is (true? (:verified context)))
                                                   {:data [dashboard]})]
                  (let [results (search/search {:term-queries ["test"]
                                                :metabot-id "test-bot"
                                                :entity-types ["dashboard"]})]
                    (is (= 1 (count results)))
                    (is (= 2 (:id (first results))))))))))))))

;; Mock embeddings: similar vectors for semantic synonym pairs, orthogonal vectors for unrelated terms.
(def ^:private test-mock-embeddings
  {"belligerent" [1.0 0.0 0.0 0.0]
   "combative"   [0.99 0.01 0.0 0.0]
   "bellicose"   [0.0 1.0 0.0 0.0]
   "quarrelsome" [0.01 0.99 0.0 0.0]
   "quixotic"    [0.0 0.0 1.0 0.0]
   "ancillary"   [0.0 0.0 0.0 0.9]
   "adjunct"     [0.0 0.0 0.0 1.0]
   "baseline"    [0.5 0.5 0.0 0.0]})

(deftest split-keywords-only-test
  (testing "search returns only exact matches for keyword terms, regardless of whether semantic search is enabled\n"
    (mt/with-test-user :rasta
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (with-and-without-semantic-search! test-mock-embeddings
          (search.tu/with-new-search-and-legacy-search
            (let [semantic-support? (search.engine/supported-engine? :search.engine/semantic)]
              ;; "belligerent" and "bellicose" are semantically similar to our search terms
              ;; ("combative", "quarrelsome") but should NOT match since we're only doing keyword search
              (mt/with-temp [:model/Dashboard {id-1 :id} {:name "belligerent"}
                             :model/Dashboard {id-2 :id} {:name "bellicose"}
                             ;; "baseline" will match via keyword/fulltext search
                             :model/Dashboard {id-3 :id} {:name "baseline"}]
                (when semantic-support?
                  (semantic.tu/index-all!))
                (let [test-entity? (comp #{id-1 id-2 id-3} :id)
                      query        (fn [base-query]
                                     (->> (search/search base-query)
                                          (filter test-entity?)
                                          (map :name)
                                          set))]
                  (testing "Semantic results are not returned for keyword terms"
                    (is (= #{"baseline"}
                           (query {:term-queries     ["combative" "quarrelsome" "baseline"]
                                   :semantic-queries []})))))))))))))

(deftest split-keyword-and-semantic-test
  (testing "search returns only exact matches for keyword terms\n"
    (mt/with-test-user :rasta
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (with-semantic-search-if-available! test-mock-embeddings
          (search.tu/with-new-search-and-legacy-search
            ;; "belligerent" and "baseline" will match via keyword search (exact match in term-queries)
            ;; "ancillary" and "adjunct" will match via semantic search (similar embeddings)
            ;; "bellicose" and "quixotic" should NOT match (not in search terms)
            (mt/with-temp [:model/Dashboard {id-1 :id} {:name "belligerent"}
                           :model/Dashboard {id-2 :id} {:name "bellicose"}
                           :model/Dashboard {id-3 :id} {:name "ancillary"}
                           :model/Dashboard {id-4 :id} {:name "adjunct"}
                           :model/Dashboard {id-5 :id} {:name "quixotic"}
                           :model/Dashboard {id-6 :id} {:name "baseline"}]
              (semantic.tu/index-all!)
              (let [test-entity? (comp #{id-1 id-2 id-3 id-4 id-5 id-6} :id)
                    query        (fn [base-query]
                                   (->> (search/search base-query)
                                        (filter test-entity?)
                                        (map :name)
                                        set))]
                (testing "Semantic results are only returned for semantic terms"
                  (is (= #{"baseline" "belligerent" "ancillary" "adjunct"}
                         (query {:term-queries     ["baseline" "belligerent"]
                                 :semantic-queries ["ancillary"]}))))))))))))
