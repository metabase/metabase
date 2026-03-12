(ns metabase.xrays.automagic-dashboards.filters-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.xrays.automagic-dashboards.filters :as filters]))

(deftest ^:parallel replace-date-range-test
  (testing "Replace range with the more specific `:=`."
    (is (=? [[:= {} [:field {:source-field 1} 9] "foo"]
             [:= {} [:field {} 2] 42]]
            (filters/inject-refinement
             (mapv
              lib/normalize
              [[:= [:field 9 {:source-field 1}] "foo"]
               [:and
                [:> [:field 2 nil] 10]
                [:< [:field 2 nil] 100]]])
             (lib/normalize
              [:= [:field 2 nil] 42]))))))

(deftest ^:parallel merge-using-and-test
  (testing "If there's no overlap between filter clauses, just merge using `:and`."
    (is (=? [[:= {} [:field {:source-field 1} 9] "foo"]
             [:> {} [:field {} 2] 10]
             [:< {} [:field {} 2] 100]
             [:= {} [:field {} 3] 42]]
            (filters/inject-refinement
             (mapv
              lib/normalize
              [[:= [:field 9 {:source-field 1}] "foo"]
               [:and
                [:> [:field 2 nil] 10]
                [:< [:field 2 nil] 100]]])
             (lib/normalize [:= [:field 3 nil] 42]))))))

(deftest ^:parallel interesting-fields-test
  (testing "Should return only :type/Temporal and :type/Boolean fields, or fields with the :type/Category semantic type"
    (is (=? ["DATE" "CATEGORY" "BOOLEAN"]
            (->> [{:name "ID" :base_type :type/Integer :semantic_type :type/PK}
                  {:name "CATEGORY", :base_type :type/Text, :semantic_type :type/Category}
                  {:name "BOOLEAN", :base_type :type/Boolean, :semantic_type nil}
                  {:name "DATE" :base_type :type/Date :semantic_type nil}]
                 filters/interesting-fields
                 (map :name))))))
