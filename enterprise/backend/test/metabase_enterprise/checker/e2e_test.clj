(ns metabase-enterprise.checker.e2e-test
  "End-to-end test running the checker against the serialization baseline export.

   This exercises the full pipeline: YAML parsing → index building → store →
   provider → query validation → structural checks → results.

   The baseline at test_resources/serialization_baseline is a real serdes export
   with cards, dashboards, transforms, snippets, and documents backed by
   the sample database schema."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase-enterprise.checker.semantic :as checker]))

(set! *warn-on-reflection* true)

(def ^:private export-dir  "test_resources/serialization_baseline")
(def ^:private schema-dir  "test_resources/serialization_baseline/databases")

(def ^:private baseline-results
  "Checker results for the baseline export. Computed once, shared across all tests."
  (delay (:results (checker/check export-dir schema-dir))))

(defn- failures-report
  "Format failing results for assertion messages."
  [results status]
  (->> results
       (filter #(= status (checker/result-status (second %))))
       (map checker/format-error)
       (str/join "\n")))

(deftest baseline-export-no-errors-test
  (testing "The serialization baseline export passes all checks with zero errors"
    (let [results @baseline-results
          summary (checker/summarize-results results)]
      (is (=? {:ok pos-int?
               :errors 0
               :unresolved 0
               :native-errors 0
               :issues 0}
              summary))
      (is (> (:total summary) 45)
          "Should check cards plus non-card entities (dashboards, transforms, etc.)")
      (is (pos? (:total summary))
          "Should check at least one entity")
      (is (zero? (:errors summary))
          (str "Errors:\n" (failures-report results :error)))
      (is (zero? (:unresolved summary))
          (str "Unresolved:\n" (failures-report results :unresolved)))
      (is (zero? (:native-errors summary))
          (str "Native SQL errors:\n" (failures-report results :native-errors)))
      (is (zero? (:issues summary))
          (str "Issues:\n" (failures-report results :issues))))))

(deftest baseline-export-card-refs-populated-test
  (testing "Checked cards have populated ref data (tables, fields)"
    (let [card-results (->> @baseline-results vals (filter :refs))]
      (is (pos? (count card-results))
          "At least some cards should have refs")
      (is (some #(seq (get-in % [:refs :tables])) card-results)
          "At least one card should reference tables")
      (is (some #(seq (get-in % [:refs :fields])) card-results)
          "At least one card should reference fields"))))

;;; ===========================================================================
;;; Card shape assertions — verify detailed analysis on specific cards
;;; ===========================================================================

(defn- normalize [x] (walk/postwalk x (cond-> x (sequential? x) set)))

(deftest joins-card-shape-test
  (testing "MBQL card with 3 joins resolves all tables and fields"
    (let [result (get @baseline-results "wpW9JO5MsHQd0-7WrR7gN")]
      (is (=? (normalize
               {:card-id pos-int?
                :name "Joins - Strategies and Compound Conditions",
                :entity-id "wpW9JO5MsHQd0-7WrR7gN",
                :refs {:tables ["Sample Database.PUBLIC.PRODUCTS"
                                "Sample Database.PUBLIC.REVIEWS"
                                "Sample Database.PUBLIC.ORDERS"
                                "Sample Database.PUBLIC.PEOPLE"],
                       :fields ["Sample Database.PUBLIC.ORDERS.ID"
                                "Sample Database.PUBLIC.ORDERS.USER_ID"
                                "Sample Database.PUBLIC.ORDERS.PRODUCT_ID"
                                "Sample Database.PUBLIC.ORDERS.SUBTOTAL"
                                "Sample Database.PUBLIC.ORDERS.TAX"
                                "Sample Database.PUBLIC.ORDERS.TOTAL"
                                "Sample Database.PUBLIC.ORDERS.DISCOUNT"
                                "Sample Database.PUBLIC.ORDERS.CREATED_AT"
                                "Sample Database.PUBLIC.ORDERS.QUANTITY"
                                "Sample Database.PUBLIC.PRODUCTS.ID"
                                "Sample Database.PUBLIC.PRODUCTS.EAN"
                                "Sample Database.PUBLIC.PRODUCTS.TITLE"
                                "Sample Database.PUBLIC.PRODUCTS.CATEGORY"
                                "Sample Database.PUBLIC.PRODUCTS.VENDOR"
                                "Sample Database.PUBLIC.PRODUCTS.PRICE"
                                "Sample Database.PUBLIC.PRODUCTS.RATING"
                                "Sample Database.PUBLIC.PRODUCTS.CREATED_AT"
                                "Sample Database.PUBLIC.PEOPLE.NAME"
                                "Sample Database.PUBLIC.PEOPLE.STATE"]}})
              (normalize result)))
      ;; REVIEWS fields are NOT in the list because the join has `fields: none`
      ;; — only join condition fields from REVIEWS are used, not selected.
      ;; The REVIEWS table IS resolved though (checked above).
      (is (-> result :source-cards empty?)))))

;;;; note: these are all sets here for equality's sake. But they traditionally are vectors

(deftest measure-metric-segment-refs-test
  (testing "Card with measure, metric, and segment references tracks them all"
    (let [result (get @baseline-results "kBjQ5VXJ5z3vYSW72J6qa")]
      (is (=? {:card-id pos-int?,
               :name "Metric, Measure, and Segment References",
               :entity-id "kBjQ5VXJ5z3vYSW72J6qa",
               :refs {:tables ["Sample Database.PUBLIC.ORDERS"],
                      :source-cards ["Total Revenue"],
                      :measures ["DBap2523KuN4Lt-cYrUjF"],
                      :metrics ["IW8kbqZVaMxdGtCM2F4U6"],
                      :segments ["OaFXAvEzPvu9ZXW5PUMRa"]}}
              result)))))

(deftest transitive-entity-refs-test
  (testing "Source card reference transitively surfaces the inner card's snippets, measures, segments"
    (let [;; "Native Query - Card and Snippet References" sources from
          ;; "Basic Aggregations" AND uses a snippet.
          snippet-card (get @baseline-results "HiBFSt0BNx5s5MxVDLLKB")]
      ;; The snippet card itself uses a snippet and sources from Basic Aggregations.
      ;; Basic Aggregations references ORDERS table — that should appear transitively.
      (is (=? {:card-id pos-int?
               :name "Native Query - Card and Snippet References",
               :entity-id "HiBFSt0BNx5s5MxVDLLKB",
               :refs {:source-cards ["Basic Aggregations"],
                      :tables ["Sample Database.PUBLIC.ORDERS"],
                      :fields ["Sample Database.PUBLIC.ORDERS.CREATED_AT"],
                      :snippets ["Active Product Filter"]}}
              snippet-card)))))
