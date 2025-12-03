(ns metabase-enterprise.metabot-v3.tools.semantic-search-test
  "Semantic search tests specific to the Metabot search tool integration."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.search :as search]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

(use-fixtures :once #'semantic.tu/once-fixture)

(defmacro with-semantic-search-if-available! [mock-embeddings & body]
  `(mt/with-premium-features #{:semantic-search}
     (when (search.engine/supported-engine? :search.engine/semantic)
       (semantic.tu/with-mock-embeddings ~mock-embeddings
         (binding [search.ingestion/*disable-updates* false
                   search.ingestion/*force-sync* true]
           ~@body)))))

(defmacro with-and-without-semantic-search! [mock-embeddings & body]
  `(do ~@body (with-semantic-search-if-available! ~mock-embeddings ~@body)))

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
  (testing "search returns only exact matches for keyword terms when {:split-semantic-terms true}, regardless of whether semantic search is enabled\n"
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
                (doseq [unified-disjunct-querying [false true]]
                  (testing (str "{unified-disjunct-querying " unified-disjunct-querying "}\n")
                    (let [base-query   {:term-queries     ["combative" "quarrelsome" "baseline"]
                                        :semantic-queries []}
                          test-entity? (comp #{id-1 id-2 id-3} :id)
                          query        (fn [unified-disjunct-querying]
                                         (->> (search/search (assoc base-query
                                                                    :experimental-opts
                                                                    {:unified-disjunct-querying unified-disjunct-querying
                                                                     :split-semantic-terms      true}))
                                              (filter test-entity?)
                                              (map :name)))]
                      (testing "Semantic results are not returned for keyword terms"
                        (is (= #{"baseline"}
                               (set (query unified-disjunct-querying))))))))))))))))

(deftest split-keyword-and-semantic-test
  (testing "search returns only exact matches for keyword terms when {:split-semantic-terms true}\n"
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
              (doseq [unified-disjunct-querying [false true]]
                (testing (str "{unified-disjunct-querying " unified-disjunct-querying "}\n")
                  (let [base-query   {:term-queries     ["baseline" "belligerent"]
                                      :semantic-queries ["ancillary"]}
                        test-entity? (comp #{id-1 id-2 id-3 id-4 id-5 id-6} :id)
                        query        (fn [unified-disjunct-querying]
                                       (->> (search/search (assoc base-query
                                                                  :experimental-opts
                                                                  {:unified-disjunct-querying unified-disjunct-querying
                                                                   :split-semantic-terms      true}))
                                            (filter test-entity?)
                                            (map :name)))]
                    (testing "Semantic results are only returned for semantic terms"
                      (is (= #{"baseline" "belligerent" "ancillary" "adjunct"}
                             (set (query unified-disjunct-querying)))))))))))))))
