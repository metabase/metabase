(ns metabase.lib.display-name-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.display-name :as lib.display-name]))

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
    ;; More specific patterns (with suffix) must come before general patterns
    (let [patterns [{:prefix "Sum of ", :suffix " matching condition"}
                    {:prefix "Sum of ", :suffix ""}
                    {:prefix "Distinct values of ", :suffix ""}]]
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
    (let [patterns [{:prefix "Distinct values of ", :suffix ""}]]
      (is (= [{:type :static, :value "Distinct values of "}
              {:type :translatable, :value "Products"}
              {:type :static, :value " → "}
              {:type :translatable, :value "Created At"}]
             (lib.display-name/parse-column-display-name-parts "Distinct values of Products → Created At" patterns))))))

(deftest ^:parallel parse-column-display-name-parts-complex-test
  (testing "Complex pattern: aggregation with implicit join and temporal bucket"
    (let [patterns [{:prefix "Distinct values of ", :suffix ""}]]
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
