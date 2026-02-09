(ns metabase.lib.display-name-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.display-name :as lib.display-name]
   [metabase.lib.filter :as lib.filter]))

(deftest ^:parallel parse-column-display-name-parts-plain-column-test
  (testing "Plain column names should be translatable"
    (is (= [{:type :translatable, :value "Total"}]
           (lib.display-name/parse-column-display-name-parts "Total")))
    (is (= [{:type :translatable, :value "Created At"}]
           (lib.display-name/parse-column-display-name-parts "Created At")))))

(deftest ^:parallel parse-column-display-name-parts-temporal-bucket-test
  (testing "Temporal bucket patterns should have static suffix"
    (is (= [{:type :translatable, :value "Total"}
            {:type :static, :value ": "}
            {:type :static, :value "Month"}]
           (lib.display-name/parse-column-display-name-parts "Total: Month")))
    (is (= [{:type :translatable, :value "Created At"}
            {:type :static, :value ": "}
            {:type :static, :value "Day of week"}]
           (lib.display-name/parse-column-display-name-parts "Created At: Day of week")))))

(deftest ^:parallel parse-column-display-name-parts-join-test
  (testing "Joined table patterns should have translatable parts separated by static arrow"
    (is (= [{:type :translatable, :value "Products"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Total"}]
           (lib.display-name/parse-column-display-name-parts "Products → Total")))
    (is (= [{:type :translatable, :value "Orders"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Products"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Total"}]
           (lib.display-name/parse-column-display-name-parts "Orders → Products → Total")))))

(deftest ^:parallel parse-column-display-name-parts-implicit-join-test
  (testing "Implicit join patterns (with dash) should be parsed when arrow is present"
    (is (= [{:type :translatable, :value "People"}
            {:type :static, :value " - "}
            {:type :translatable, :value "Product"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Created At"}]
           (lib.display-name/parse-column-display-name-parts "People - Product → Created At")))))

(deftest ^:parallel parse-column-display-name-parts-join-with-temporal-bucket-test
  (testing "Joined table with temporal bucket"
    (is (= [{:type :translatable, :value "Products"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Created At"}
            {:type :static, :value ": "}
            {:type :static, :value "Month"}]
           (lib.display-name/parse-column-display-name-parts "Products → Created At: Month")))))

(deftest ^:parallel parse-column-display-name-parts-aggregation-test
  (testing "Aggregation patterns should have static prefix/suffix"
    (let [patterns (lib.aggregation/aggregation-display-name-patterns)]
      (is (= [{:type :static, :value "Sum of "}
              {:type :translatable, :value "Total"}]
             (lib.display-name/parse-column-display-name-parts "Sum of Total" patterns)))
      (is (= [{:type :static, :value "Distinct values of "}
              {:type :translatable, :value "Category"}]
             (lib.display-name/parse-column-display-name-parts "Distinct values of Category" patterns)))
      (is (= [{:type :static, :value "Sum of "}
              {:type :translatable, :value "Price"}
              {:type :static, :value " matching condition"}]
             (lib.display-name/parse-column-display-name-parts "Sum of Price matching condition" patterns))))))

(deftest ^:parallel parse-column-display-name-parts-aggregation-with-join-test
  (testing "Aggregation with joined table"
    (let [patterns (lib.aggregation/aggregation-display-name-patterns)]
      (is (= [{:type :static, :value "Distinct values of "}
              {:type :translatable, :value "Products"}
              {:type :static, :value " → "}
              {:type :translatable, :value "Created At"}]
             (lib.display-name/parse-column-display-name-parts "Distinct values of Products → Created At" patterns))))))

(deftest ^:parallel parse-column-display-name-parts-complex-test
  (testing "Complex pattern: aggregation with implicit join and temporal bucket"
    (let [patterns (lib.aggregation/aggregation-display-name-patterns)]
      (is (= [{:type :static, :value "Distinct values of "}
              {:type :translatable, :value "People"}
              {:type :static, :value " - "}
              {:type :translatable, :value "Product"}
              {:type :static, :value " → "}
              {:type :translatable, :value "Created At"}
              {:type :static, :value ": "}
              {:type :static, :value "Month"}]
             (lib.display-name/parse-column-display-name-parts
              "Distinct values of People - Product → Created At: Month"
              patterns))))))

(deftest ^:parallel parse-column-display-name-parts-rtl-test
  (testing "RTL pattern: value comes first (e.g., Hebrew 'Sum of X' = 'X של סכום')"
    (let [patterns [{:prefix "", :suffix " של סכום"}]]
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " של סכום"}]
             (lib.display-name/parse-column-display-name-parts "Total של סכום" patterns)))))

  (testing "Wrapped pattern: value in middle (e.g., French 'Somme de X totale')"
    (let [patterns [{:prefix "Somme de ", :suffix " totale"}]]
      (is (= [{:type :static, :value "Somme de "}
              {:type :translatable, :value "Total"}
              {:type :static, :value " totale"}]
             (lib.display-name/parse-column-display-name-parts "Somme de Total totale" patterns)))))

  (testing "Nested RTL patterns"
    (let [patterns [{:prefix "", :suffix " של סכום"}
                    {:prefix "", :suffix " של מינימום"}]]
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " של מינימום"}
              {:type :static, :value " של סכום"}]
             (lib.display-name/parse-column-display-name-parts "Total של מינימום של סכום" patterns)))))

  (testing "RTL pattern with join"
    (let [patterns [{:prefix "", :suffix " של סכום"}]]
      (is (= [{:type :translatable, :value "Products"}
              {:type :static, :value " → "}
              {:type :translatable, :value "Total"}
              {:type :static, :value " של סכום"}]
             (lib.display-name/parse-column-display-name-parts "Products → Total של סכום" patterns))))))

(deftest ^:parallel parse-column-display-name-parts-filter-test
  (let [filter-patterns (lib.filter/filter-display-name-patterns)
        conjunctions    (lib.filter/compound-filter-conjunctions)]
    (testing "Between filter should not split 'and' in values as compound conjunction"
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " is between "}
              {:type :static, :value "100 and 200"}]
             (lib.display-name/parse-column-display-name-parts "Total is between 100 and 200" nil filter-patterns conjunctions))))

    (testing "Greater than filter"
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " is greater than "}
              {:type :static, :value "100"}]
             (lib.display-name/parse-column-display-name-parts "Total is greater than 100" nil filter-patterns conjunctions))))

    (testing "Unary filter (not)"
      (is (= [{:type :static, :value "not "}
              {:type :translatable, :value "Total"}]
             (lib.display-name/parse-column-display-name-parts "not Total" nil filter-patterns conjunctions))))

    (testing "Unary filter (is empty)"
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " is empty"}]
             (lib.display-name/parse-column-display-name-parts "Total is empty" nil filter-patterns conjunctions))))

    (testing "Filter with join"
      (is (= [{:type :translatable, :value "Products"}
              {:type :static, :value " → "}
              {:type :translatable, :value "Total"}
              {:type :static, :value " is between "}
              {:type :static, :value "100 and 200"}]
             (lib.display-name/parse-column-display-name-parts "Products → Total is between 100 and 200" nil filter-patterns conjunctions))))

    (testing "Filter with temporal bucket"
      (is (= [{:type :translatable, :value "Created At"}
              {:type :static, :value ": "}
              {:type :static, :value "Month"}
              {:type :static, :value " is before "}
              {:type :static, :value "2024"}]
             (lib.display-name/parse-column-display-name-parts "Created At: Month is before 2024" nil filter-patterns conjunctions))))

    (testing "Contains filter"
      (is (= [{:type :translatable, :value "Category"}
              {:type :static, :value " contains "}
              {:type :static, :value "Widget"}]
             (lib.display-name/parse-column-display-name-parts "Category contains Widget" nil filter-patterns conjunctions))))

    (testing "Does not contain filter"
      (is (= [{:type :translatable, :value "Category"}
              {:type :static, :value " does not contain "}
              {:type :static, :value "Widget"}]
             (lib.display-name/parse-column-display-name-parts "Category does not contain Widget" nil filter-patterns conjunctions))))))

(deftest ^:parallel parse-column-display-name-parts-compound-filter-test
  (let [filter-patterns (lib.filter/filter-display-name-patterns)
        conjunctions    (lib.filter/compound-filter-conjunctions)]
    (testing "Two-item compound filter with 'or'"
      (is (= [{:type :translatable, :value "Review Requested At"}
              {:type :static, :value " is not empty"}
              {:type :static, :value " or "}
              {:type :translatable, :value "Reviewed At"}
              {:type :static, :value " is not empty"}]
             (lib.display-name/parse-column-display-name-parts
              "Review Requested At is not empty or Reviewed At is not empty"
              nil filter-patterns conjunctions))))

    (testing "Two-item compound filter with 'and'"
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " is greater than "}
              {:type :static, :value "100"}
              {:type :static, :value " and "}
              {:type :translatable, :value "Price"}
              {:type :static, :value " is less than "}
              {:type :static, :value "50"}]
             (lib.display-name/parse-column-display-name-parts
              "Total is greater than 100 and Price is less than 50"
              nil filter-patterns conjunctions))))

    (testing "Three-item compound filter"
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " is empty"}
              {:type :static, :value ", "}
              {:type :translatable, :value "Price"}
              {:type :static, :value " is empty"}
              {:type :static, :value ", and "}
              {:type :translatable, :value "Status"}
              {:type :static, :value " is empty"}]
             (lib.display-name/parse-column-display-name-parts
              "Total is empty, Price is empty, and Status is empty"
              nil filter-patterns conjunctions))))))

(deftest ^:parallel parse-column-display-name-parts-filter-with-aggregation-test
  (let [agg-patterns    (lib.aggregation/aggregation-display-name-patterns)
        filter-patterns (lib.filter/filter-display-name-patterns)]
    (testing "Filter patterns should not interfere with aggregation patterns"
      (is (= [{:type :static, :value "Sum of "}
              {:type :translatable, :value "Total"}]
             (lib.display-name/parse-column-display-name-parts "Sum of Total" agg-patterns filter-patterns))))

    (testing "Plain column name is unchanged when filter patterns are present"
      (is (= [{:type :translatable, :value "Total"}]
             (lib.display-name/parse-column-display-name-parts "Total" agg-patterns filter-patterns))))))
