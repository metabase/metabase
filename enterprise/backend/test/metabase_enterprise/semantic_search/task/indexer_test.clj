(ns metabase-enterprise.semantic-search.task.indexer-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic.core]
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
      (mt/with-dynamic-fn-redefs [semantic.u/semantic-search-available? (constantly true)
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
