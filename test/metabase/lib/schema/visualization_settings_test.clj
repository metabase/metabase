(ns metabase.lib.schema.visualization-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.visualization-settings :as lib.schema.visualization-settings]))

(deftest ^:parallel normalize-mbql-clause-impostor-in-visualization-settings-test
  (let [viz-settings
        {"table.pivot_column" "TAX"
         "graph.metrics" ["expression"]
         "pivot_table.column_split"
         {"rows"
          ["CREATED_AT" "expression" "TAX"]
          "columns" []
          "values" ["sum"]}
         "pivot_table.column_widths" {"leftHeaderWidths" [141 99 80], "totalLeftHeaderWidths" 320, "valueHeaderWidths" {}}
         "table.cell_column" "expression"
         "table.column_formatting"
         [{"columns" ["expression" nil "TAX" "count"]
           "type" "single"
           "operator" "is-null"
           "value" 10
           "color" "#EF8C8C"
           "highlight_row" false
           "id" 0}]
         "column_settings" {"[\"ref\",[\"expression\",\"expression\"]]" {"number_style" "currency"}}
         "series_settings" {"expression" {"line.interpolate" "step-after", "line.style" "dotted"}}
         "graph.dimensions" ["CREATED_AT"]}]
    (is (= {:table.pivot_column "TAX"
            :graph.metrics ["expression"]
            :pivot_table.column_split
            {:rows ["CREATED_AT" "expression" "TAX"]
             :columns []
             :values ["sum"]}
            :pivot_table.column_widths {:leftHeaderWidths [141 99 80], :totalLeftHeaderWidths 320, :valueHeaderWidths {}}
            :table.cell_column "expression"
            :table.column_formatting
            [{:columns ["expression" nil "TAX" "count"]
              :type "single"
              :operator "is-null"
              :value 10
              :color "#EF8C8C"
              :highlight_row false
              :id 0}]
            :column_settings {"[\"ref\",[\"expression\",\"expression\"]]" {:number_style "currency"}}
            :series_settings {:expression {:line.interpolate "step-after", :line.style "dotted"}}
            :graph.dimensions ["CREATED_AT"]}
           (lib/normalize ::lib.schema.visualization-settings/visualization-settings viz-settings)))))

(deftest ^:parallel normalize-invalid-visualization-settings-test
  (testing "Unknown keys in `:column_settings` should be removed rather than causing normalization to fail (#69626)"
    (let [viz-settings {"column_settings" {"[\"ref\",[\"expression\",\"expression\"]]" {:number_style "x"}
                                           "[\"REF\",[\"expression\",\"expression\"]]" {:number_style "y"}
                                           "[\"bad-clause\",\"a\"]"                    {:number_style "z"}}}]
      (is (= {:column_settings
              {"[\"ref\",[\"expression\",\"expression\"]]" {:number_style "x"}}}
             (lib/normalize ::lib.schema.visualization-settings/visualization-settings viz-settings))))))

(deftest ^:parallel normalize-column-names-and-legacy-refs-test
  (testing "settings that refer to columns keep names, even ones like \"expression\", and normalize legacy refs"
    (is (= {:pivot_table.column_split   {:rows    ["expression" "TAX"]
                                         :columns [[:field 1 nil] nil]
                                         :values  [[:aggregation 0]]}
            :pivot_table.collapsed_rows {:rows ["CREATED_AT" [:field 2 {:temporal-unit :month}]]}
            :table.column_formatting    [{:columns ["expression" [:expression "x"]]}]
            :graph.dimensions           ["expression" "TAX"]}
           (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                          {"pivot_table.column_split"   {"rows"    ["expression" "TAX"]
                                                         "columns" [["field-id" 1] nil]
                                                         "values"  [["aggregation" 0]]}
                           "pivot_table.collapsed_rows" {"rows" ["CREATED_AT" ["datetime-field" ["field-id" 2] "month"]]}
                           "table.column_formatting"    [{"columns" ["expression" ["expression" "x"]]}]
                           "graph.dimensions"           ["expression" "TAX"]})))))

(deftest ^:parallel normalize-table-columns-test
  (testing "table columns give their legacy ref under :fieldRef, whichever spelling they had, and drop :key"
    (is (= {:table.columns [{:name "A" :fieldRef [:field 3 nil]}
                            {:name "B" :fieldRef [:field 4 nil]}
                            {:name "C" :fieldRef "C"}
                            {:name "D" :enabled true}]}
           (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                          {"table.columns" [{"name" "A" "key" "x" "fieldRef" ["field-id" 3]}
                                            {"name" "B" "field_ref" ["field" 4 nil]}
                                            {"name" "C" "fieldref" "C"}
                                            {"name" "D" "enabled" true}]})))))

(deftest ^:parallel normalize-click-behavior-dimension-test
  (testing "a click behavior dimension target keeps its \"dimension\" tag and normalizes the ref of its column"
    (let [mapping {:target {:type "dimension" :dimension ["dimension" [:field 3 nil]]}}]
      (is (= {:click_behavior  {:parameterMapping {:abc mapping}}
              :column_settings {"[\"name\",\"A\"]" {:click_behavior {:parameterMapping {:abc mapping}}}}}
             (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                            {"click_behavior"  {"parameterMapping" {"abc" {"target" {"type"      "dimension"
                                                                                     "dimension" [:dimension ["field-id" 3]]}}}}
                             "column_settings" {"[\"name\",\"A\"]"
                                                {"click_behavior" {"parameterMapping" {"abc" {"target" {"type"      "dimension"
                                                                                                        "dimension" ["dimension" ["field" 3 nil]]}}}}}}}))))))

(deftest ^:parallel normalize-column-settings-keys-test
  (testing "keys that wrap a legacy ref in ref, a column name in name, or are a bare legacy ref are normalized, others dropped"
    (is (= {:column_settings {"[\"name\",\"A\"]"              {:a 1}
                              "[\"ref\",[\"field\",1,null]]" {:a 2}
                              "[\"field\",2,null]"           {:a 3}}}
           (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                          {"column_settings" {"[\"name\", \"A\"]"            {"a" 1}
                                              "[\"ref\",[\"field-id\",1]]"   {"a" 2}
                                              "[\"field-id\",2]"             {"a" 3}
                                              "[\"name\",0]"                 {"a" 4}
                                              "[\"ref\",[\"weird\"]]"        {"a" 5}
                                              "[\"REF\",[\"field\",1,null]]" {"a" 6}}})))))
