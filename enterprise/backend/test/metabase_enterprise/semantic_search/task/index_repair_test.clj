(ns metabase-enterprise.semantic-search.task.index-repair-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic-search.core]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase-enterprise.semantic-search.task.index-repair :as index-repair]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]))

(deftest successful-repair-reports-current-orphan-count-test
  (let [reported (atom [])]
    (mt/with-dynamic-fn-redefs
      [search.ingestion/searchable-documents  (constantly [])
       semantic-search.core/repair-index!      (constantly 7)
       semantic.health/report-repair-orphans! #(swap! reported conj %)]
      (#'index-repair/repair-index!)
      (is (= [7] @reported)))))

(deftest failed-repair-invalidates-orphan-count-test
  (let [reported (atom [])]
    (mt/with-dynamic-fn-redefs
      [search.ingestion/searchable-documents  (constantly [])
       semantic-search.core/repair-index!      (fn [& _] (throw (ex-info "repair failed" {})))
       semantic.health/report-repair-orphans! #(swap! reported conj %)]
      (#'index-repair/repair-index!)
      (is (= [nil] @reported)))))
