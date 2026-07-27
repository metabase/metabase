(ns metabase-enterprise.semantic-search.task.indexer-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.indexer :as semantic.indexer]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.task.indexer :as sut]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.task.core :as task]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest startup-hnsw-safety-net-test
  (testing "the indexer task's startup builds the HNSW index when configured for any index-backed strategy"
    ;; Covers instances that boot already configured for an HNSW-index-backed strategy (e.g. strategy set via
    ;; env var), where the setter's transition event never fired -- see the safety net in sut/init!. Redefs
    ;; avoid scheduling a real quartz job or spawning a real build future.
    (let [builds (atom 0)]
      (mt/with-dynamic-fn-redefs [semantic.u/semantic-search-configured? (constantly true)
                                  task/schedule-task!                   (fn [& _] nil)
                                  semantic.core/build-hnsw-index-async! (fn [] (swap! builds inc))]
        (testing ":brute-force does not trigger a build"
          (mt/with-dynamic-fn-redefs [semantic.settings/semantic-search-vector-strategy (constantly :brute-force)]
            (task/init! ::sut/SemanticSearchIndexer))
          (is (zero? @builds)))
        (doseq [strategy [:hnsw :hnsw-iterative-relaxed :hnsw-iterative-strict]]
          (testing (str strategy " triggers a build")
            (reset! builds 0)
            (mt/with-dynamic-fn-redefs [semantic.settings/semantic-search-vector-strategy (constantly strategy)]
              (task/init! ::sut/SemanticSearchIndexer))
            (is (= 1 @builds))))))))

(deftest indexer-builds-only-absent-or-abandoned-hnsw-indexes-test
  (let [builds (atom 0)
        runs   (atom 0)
        job    (sut/->SemanticSearchIndexer)]
    (mt/with-dynamic-fn-redefs
      [semantic.u/semantic-search-active?                   (constantly true)
       semantic.env/get-pgvector-datasource!                (constantly ::pgvector)
       semantic.env/get-index-metadata                      (constantly ::index-metadata)
       semantic.index-metadata/get-active-index-state       (constantly {:index {:table-name "index_1"}})
       semantic.settings/semantic-search-vector-strategy    (constantly :hnsw)
       semantic.core/build-hnsw-index-async!                 #(swap! builds inc)
       semantic.indexer/quartz-job-run!                      (fn [& _] (swap! runs inc))]
      (doseq [[state expected-builds] [[nil 1] [:invalid 1] [:building 0] [:ready 0]]]
        (reset! builds 0)
        (mt/with-dynamic-fn-redefs [semantic.u/index-state (constantly state)]
          (.execute ^org.quartz.Job job nil))
        (is (= expected-builds @builds) (str state " build count")))
      (is (= 4 @runs) "index maintenance continues in every catalog state"))))
