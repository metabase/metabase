(ns metabase-enterprise.dependencies.models.statuses-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.dependencies.models.analysis-finding-status :as analysis-finding-status]
   [metabase-enterprise.dependencies.models.dependency-status :as dependency-status]
   [metabase-enterprise.dependencies.models.result-metadata-status :as result-metadata-status]
   [metabase.events.test-util :as events.tu]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (let [ids     (fn [n] (set (range 1 (inc n))))
        counted (fn [f]
                  (f 1)
                  (is (= (f 2) (f 6))))]
    (testing "marking statuses stale"
      (doseq [[label mark!] [["dependency" dependency-status/mark-dependency-statuses-stale!]
                             ["result metadata" result-metadata-status/mark-result-metadata-statuses-stale!]
                             ["analysis finding" analysis-finding-status/mark-analysis-finding-statuses-stale!]]]
        (testing label
          (counted (fn [n] (events.tu/statement-count! #(mark! {:card (ids n) :table (ids n)})))))))
    (testing "marking the statuses of dependents stale"
      (doseq [[label mark!] [["result metadata" result-metadata-status/mark-dependents-result-metadata-statuses-stale!]
                             ["analysis finding" analysis-finding-status/mark-dependents-analysis-finding-statuses-stale!]]]
        (testing label
          (counted (fn [n] (events.tu/statement-count! #(mark! :table (ids n))))))))
    (testing "marking the statuses of data apps stale"
      (counted (fn [n] (events.tu/statement-count! #(dependency-status/mark-data-app-dependency-statuses-stale! (vec (ids n)))))))
    (testing "deleting statuses"
      (doseq [[label delete!] [["dependency" dependency-status/delete-dependency-statuses!]
                               ["analysis finding" analysis-finding-status/delete-analysis-finding-statuses!]]]
        (testing label
          (counted (fn [n] (events.tu/statement-count! #(delete! :card (vec (ids n))))))))
      (testing "result metadata"
        (counted (fn [n] (events.tu/statement-count! #(result-metadata-status/delete-result-metadata-statuses! (vec (ids n))))))))))
