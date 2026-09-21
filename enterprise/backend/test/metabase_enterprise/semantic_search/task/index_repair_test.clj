(ns metabase-enterprise.semantic-search.task.index-repair-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic-search.core]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase-enterprise.semantic-search.repair :as semantic.repair]
   [metabase-enterprise.semantic-search.task.index-repair :as index-repair]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(deftest successful-repair-reports-current-metric-snapshot-test
  (let [reported    (atom [])
        snapshot-at ::snapshot-at]
    (mt/with-dynamic-fn-redefs
      [search.ingestion/searchable-documents  (constantly [])
       semantic-search.core/repair-index!      (constantly {:index-id 11, :orphans 7, :snapshot-at snapshot-at})
       semantic.health/report-repair-metrics! (fn [& args] (swap! reported conj args))]
      (#'index-repair/repair-index!)
      (is (= [[11 {:orphan-count 7, :snapshot-at snapshot-at}]] @reported)))))

(deftest lost-delete-query-failure-invalidates-metric-snapshot-test
  (let [reported (atom [])]
    (mt/with-dynamic-fn-redefs
      [search.ingestion/searchable-documents  (constantly [])
       jdbc/execute!                           (fn [& _] (throw (ex-info "anti-join failed" {})))
       semantic-search.core/repair-index!      (fn [& _]
                                                 (semantic.repair/find-lost-deletes
                                                  ::pgvector "gate" "repair"))
       semantic.health/report-repair-metrics! (fn [& args] (swap! reported conj args))]
      (#'index-repair/repair-index!)
      (is (= [[nil]] @reported)))))

(deftest interrupted-repair-invalidates-count-and-propagates-test
  (let [reported (atom [])]
    (mt/with-dynamic-fn-redefs
      [search.ingestion/searchable-documents  (constantly [])
       semantic-search.core/repair-index!      (fn [& _] (throw (InterruptedException.)))
       semantic.health/report-repair-metrics! (fn [& args] (swap! reported conj args))]
      (is (thrown? InterruptedException (#'index-repair/repair-index!)))
      (is (= [[nil]] @reported)))))
