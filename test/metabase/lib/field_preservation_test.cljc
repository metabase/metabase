(ns metabase.lib.field-preservation-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel field-selection-preserved-with-aggregation-test
  (testing "Field selection should be preserved when adding/removing aggregations (#59194)"
    (let [;; Start with a query on Orders table with specific fields selected
          base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         ;; Select only ID and Tax fields
                         (lib/with-fields [(meta/field-metadata :orders :id)
                                           (meta/field-metadata :orders :tax)]))
          ;; Verify initial fields are set
          initial-fields (lib/fields base-query)]
      (is (= 2 (count initial-fields)) "Should have 2 fields initially")
      
      (testing "adding aggregation preserves fields"
        ;; Add an aggregation (Count)
        (let [aggregated-query (lib/aggregate base-query (lib/count))
              ;; Get fields after adding aggregation
              fields-after-agg (lib/fields aggregated-query)]
          (is (not-empty fields-after-agg) "Fields should not be cleared when adding aggregation")
          (is (= 2 (count fields-after-agg)) "Should preserve the 2 original fields")))
      
      (testing "removing aggregation preserves fields"
        ;; Add then remove aggregation
        (let [aggregated-query (lib/aggregate base-query (lib/count))
              ;; Remove the aggregation  
              back-to-raw-query (lib/remove-clause aggregated-query -1 :aggregation 0)
              final-fields (lib/fields back-to-raw-query)]
          (is (not-empty final-fields) "Fields should be preserved after removing aggregation")
          (is (= 2 (count final-fields)) "Should still have the 2 original fields")))
      
      (testing "adding breakout preserves fields"
        ;; Add a breakout
        (let [breakout-query (lib/breakout base-query (meta/field-metadata :orders :user-id))
              fields-after-breakout (lib/fields breakout-query)]
          (is (not-empty fields-after-breakout) "Fields should not be cleared when adding breakout")
          (is (= 2 (count fields-after-breakout)) "Should preserve the 2 original fields"))))))

(deftest ^:parallel drill-through-fields-preserved-test
  (testing "Fields should be preserved for drill-through functionality (#59194)"
    (let [;; Create a query with selected fields, then add aggregation
          query-with-fields (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                (lib/with-fields [(meta/field-metadata :orders :id)
                                                  (meta/field-metadata :orders :tax)
                                                  (meta/field-metadata :orders :subtotal)]))
          aggregated-query (lib/aggregate query-with-fields (lib/count))
          preserved-fields (lib/fields aggregated-query)]
      
      ;; The key requirement: fields should be preserved for drill-through
      (is (= 3 (count preserved-fields)) 
          "All originally selected fields should be preserved for drill-through"))))