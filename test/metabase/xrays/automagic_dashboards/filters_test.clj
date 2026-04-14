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
  (testing "Should filter out PKs/FKs and return interesting fields sorted by score"
    (let [fields [{:name "ID" :base_type :type/Integer :semantic_type :type/PK
                   :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}}
                  {:name "CATEGORY" :base_type :type/Text :semantic_type :type/Category
                   :fingerprint {:global {:distinct-count 5 :nil% 0.0}}}
                  {:name "BOOLEAN" :base_type :type/Boolean :semantic_type nil
                   :fingerprint {:global {:distinct-count 2 :nil% 0.0}}}
                  {:name "DATE" :base_type :type/Date :semantic_type nil
                   :fingerprint {:global {:distinct-count 365 :nil% 0.0}
                                 :type {:type/DateTime {:earliest "2020-01-01" :latest "2024-01-01"}}}}]
          result (filters/interesting-fields fields)]
      (testing "PK is excluded"
        (is (not (some #(= "ID" (:name %)) result))))
      (testing "Category, Boolean, and Date fields are included"
        (is (= #{"CATEGORY" "BOOLEAN" "DATE"}
               (set (map :name result))))))))
