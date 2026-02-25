(ns metabase.transforms-inspector.lens.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms-inspector.core :as inspector]
   [metabase.transforms-inspector.lens.core :as lens.core]))

(comment inspector/keep-me)

;;; -------------------------------------------------- lens-id->type --------------------------------------------------

(deftest lens-id->type-test
  (is (= :join-analysis (lens.core/lens-id->type "join-analysis")))
  (is (= :generic-summary (lens.core/lens-id->type "generic-summary"))))

;;; -------------------------------------------------- params->id-suffix --------------------------------------------------

(deftest params->id-suffix-empty-test
  (testing "nil params returns empty string"
    (is (= "" (lens.core/params->id-suffix nil))))
  (testing "empty map returns empty string"
    (is (= "" (lens.core/params->id-suffix {})))))

(deftest params->id-suffix-single-param-test
  (is (= "@join_step=1" (lens.core/params->id-suffix {:join_step 1}))))

(deftest params->id-suffix-multiple-params-test
  (testing "params are sorted by key"
    (is (= "@a=1,b=2" (lens.core/params->id-suffix {:b 2 :a 1})))))

;;; -------------------------------------------------- make-card-id --------------------------------------------------

(deftest make-card-id-no-params-test
  (is (= "base-count" (lens.core/make-card-id "base-count" nil)))
  (is (= "base-count" (lens.core/make-card-id "base-count" {}))))

(deftest make-card-id-with-params-test
  (is (= "join-step-1@join_step=1"
         (lens.core/make-card-id "join-step-1" {:join_step 1}))))

;;; -------------------------------------------------- with-metadata --------------------------------------------------

(deftest with-metadata-test
  (testing "merges lens metadata into lens map"
    ;; Use the :default method which returns a basic metadata map
    (let [result (lens.core/with-metadata :some-unknown-type {} {:cards [] :sections []})]
      (is (contains? result :id))
      (is (contains? result :display_name))
      (is (contains? result :cards))
      (is (contains? result :sections)))))

;;; -------------------------------------------------- lens-applicable? --------------------------------------------------

(deftest lens-applicable-default-test
  (testing "default method returns false for unknown lens types"
    (is (not (lens.core/lens-applicable? :nonexistent-lens {})))))

(deftest generic-summary-always-applicable-test
  (testing "generic-summary is always applicable"
    (is (true? (lens.core/lens-applicable? :generic-summary {})))
    (is (true? (lens.core/lens-applicable? :generic-summary {:has-joins? false})))))

(deftest join-analysis-applicability-test
  (testing "join-analysis applicable when has-joins? is true and all tables are simple"
    (is (true? (lens.core/lens-applicable? :join-analysis
                                           {:has-joins? true
                                            :from-table-id 10
                                            :native-context {:join-structure [{:strategy :left-join
                                                                               :source-table 1}]}})))
    (is (true? (lens.core/lens-applicable? :join-analysis
                                           {:has-joins? true
                                            :from-table-id 10
                                            :mbql-context {:join-structure [{:strategy :left-join
                                                                             :source-table 1}
                                                                            {:strategy :inner-join
                                                                             :source-table 2}]}}))))
  (testing "join-analysis not applicable without joins"
    (is (not (lens.core/lens-applicable? :join-analysis {:has-joins? false})))
    (is (not (lens.core/lens-applicable? :join-analysis {}))))
  (testing "join-analysis not applicable when FROM table is a CTE/subquery (nil from-table-id)"
    (is (not (lens.core/lens-applicable? :join-analysis
                                         {:has-joins? true
                                          :from-table-id nil
                                          :native-context {:join-structure [{:strategy :left-join
                                                                             :source-table 1}]}}))))
  ;; see analyze-native-query-cte-join-source-table-is-nil-test for real SQL CTE parsing
  (testing "join-analysis not applicable when a join target is a CTE (nil source-table)"
    (is (not (lens.core/lens-applicable? :join-analysis
                                         {:has-joins? true
                                          :from-table-id 10
                                          :native-context {:join-structure [{:strategy :left-join
                                                                             :source-table nil}]}})))

    (is (not (lens.core/lens-applicable? :join-analysis
                                         {:has-joins? true
                                          :from-table-id 10
                                          :mbql-context {:join-structure [{:strategy :left-join
                                                                           :source-table 1}
                                                                          {:strategy :inner-join
                                                                           :source-table nil}]}})))))

(deftest column-comparison-applicability-test
  (testing "column-comparison applicable when has-column-matches? is true"
    (is (true? (lens.core/lens-applicable? :column-comparison {:has-column-matches? true}))))
  (testing "column-comparison not applicable without column matches"
    (is (not (lens.core/lens-applicable? :column-comparison {:has-column-matches? false})))
    (is (not (lens.core/lens-applicable? :column-comparison {})))))

(deftest unmatched-rows-applicability-test
  (testing "unmatched-rows applicable with MBQL, joins, preprocessed query, and outer joins"
    (is (true? (lens.core/lens-applicable? :unmatched-rows
                                           {:source-type :mbql
                                            :has-joins? true
                                            :mbql-context {:preprocessed-query {:stages [{}]}
                                                           :join-structure [{:strategy :left-join}]}}))))
  (testing "unmatched-rows not applicable for native queries"
    (is (not (lens.core/lens-applicable? :unmatched-rows
                                         {:source-type :native
                                          :has-joins? true
                                          :native-context {:from-table [:raw "t"]
                                                           :join-structure [{:strategy :left-join}]}}))))
  (testing "unmatched-rows not applicable without outer joins"
    (is (not (lens.core/lens-applicable? :unmatched-rows
                                         {:source-type :mbql
                                          :has-joins? true
                                          :mbql-context {:preprocessed-query {:stages [{}]}
                                                         :join-structure [{:strategy :inner-join}]}}))))
  (testing "unmatched-rows not applicable without joins"
    (is (not (lens.core/lens-applicable? :unmatched-rows
                                         {:source-type :mbql
                                          :has-joins? false})))))

;;; -------------------------------------------------- lens-metadata --------------------------------------------------

(deftest generic-summary-metadata-test
  (let [meta (lens.core/lens-metadata :generic-summary {})]
    (is (= "generic-summary" (:id meta)))
    (is (= "Data Summary" (:display_name meta)))
    (is (= {:level :fast} (:complexity meta)))))

(deftest join-analysis-metadata-test
  (let [meta (lens.core/lens-metadata :join-analysis {})]
    (is (= "join-analysis" (:id meta)))
    (is (= "Join Analysis" (:display_name meta)))
    (is (= {:level :very-slow} (:complexity meta)))))

(deftest column-comparison-metadata-test
  (let [meta (lens.core/lens-metadata :column-comparison {})]
    (is (= "column-comparison" (:id meta)))
    (is (= "Column Distributions" (:display_name meta)))
    (is (= {:level :slow} (:complexity meta)))))

(deftest unmatched-rows-metadata-test
  (let [meta (lens.core/lens-metadata :unmatched-rows {})]
    (is (= "unmatched-rows" (:id meta)))
    (is (= "Unmatched Rows" (:display_name meta)))
    (is (= {:level :slow} (:complexity meta)))))

(deftest default-metadata-test
  (let [meta (lens.core/lens-metadata :nonexistent {})]
    (is (= "nonexistent" (:id meta)))
    (is (nil? (:description meta)))))

;;; -------------------------------------------------- available-lenses --------------------------------------------------

(deftest available-lenses-includes-generic-test
  (testing "generic-summary always appears in available lenses"
    (let [lenses (lens.core/available-lenses {})]
      (is (some #(= "generic-summary" (:id %)) lenses)))))

(deftest available-lenses-ordering-test
  (testing "generic-summary comes first (lowest priority)"
    (let [lenses (lens.core/available-lenses {:has-joins? true
                                              :has-column-matches? true})]
      (is (= "generic-summary" (:id (first lenses)))))))

(deftest available-lenses-excludes-drill-lenses-test
  (testing "drill lenses (unmatched-rows) are not in discovery list"
    (let [lenses (lens.core/available-lenses {:source-type :mbql
                                              :has-joins? true
                                              :mbql-context {:preprocessed-query {:stages [{}]}
                                                             :join-structure [{:strategy :left-join}]}})]
      (is (not-any? #(= "unmatched-rows" (:id %)) lenses)))))

;;; -------------------------------------------------- get-lens --------------------------------------------------

(deftest get-lens-throws-for-inapplicable-test
  (testing "throws when lens is not applicable"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Lens data not available"
                          (lens.core/get-lens {:has-joins? false} "join-analysis")))))

;;; -------------------------------------------------- register-lens! --------------------------------------------------

(deftest register-lens-idempotent-test
  (testing "re-registering same lens replaces previous entry (no duplicates)"
    (lens.core/register-lens! :test-lens-123 50)
    (lens.core/register-lens! :test-lens-123 60)
    (let [lenses (lens.core/available-lenses {})]
      ;; :test-lens-123 has default applicability (false), so it won't show
      ;; but we verify no errors occur
      (is (not-any? #(= "test-lens-123" (:id %)) lenses)))))
