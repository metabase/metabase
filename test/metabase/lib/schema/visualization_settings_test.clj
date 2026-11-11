(ns metabase.lib.schema.visualization-settings-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.visualization-settings :as lib.schema.visualization-settings]
   [metabase.util.malli.registry :as mr]))

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
    (let [viz-settings {"column_settings" {"[\"ref\",[\"expression\",\"expression\"]]" {:number_style "currency"}
                                           "[\"REF\",[\"expression\",\"expression\"]]" {:number_style "percent"}
                                           "[\"bad-clause\",\"a\"]"                    {:number_style "decimal"}}}]
      (is (= {:column_settings
              {"[\"ref\",[\"expression\",\"expression\"]]" {:number_style "currency"}}}
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
      (is (= {:click_behavior  {:parameterMapping {"abc" mapping}}
              :column_settings {"[\"name\",\"A\"]" {:click_behavior {:parameterMapping {"abc" mapping}}}}}
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

(deftest ^:parallel normalize-drops-invalid-values-test
  (testing "invalid values of the keys the schema types are dropped, so the settings stay valid"
    (let [normalized (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                                    {"click_behavior"   "x"
                                     "table.columns"    42
                                     "graph.dimensions" ["A"]
                                     "column_settings"  {"[\"name\",\"A\"]" {"click_behavior" 42 "currency" "USD"}
                                                         "[\"name\",\"B\"]" 7}})]
      (is (= {:graph.dimensions ["A"]
              :column_settings  {"[\"name\",\"A\"]" {:currency "USD"}}}
             normalized))
      (is (mr/validate ::lib.schema.visualization-settings/visualization-settings normalized)))))

(deftest ^:parallel normalize-keeps-entry-order-test
  (testing "normalizing keeps the order of the entries, which the frontend reads the visualizer columns in"
    (let [normalized (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                                    {"visualization" {"columnValuesMapping" (array-map "COLUMN_1" [] "COLUMN_2" []
                                                                                       "COLUMN_3" [] "COLUMN_4" [])}})]
      (is (= [:COLUMN_1 :COLUMN_2 :COLUMN_3 :COLUMN_4]
             (keys (get-in normalized [:visualization :columnValuesMapping])))))))

(deftest ^:parallel normalize-click-behavior-dimension-options-test
  (testing "a click behavior dimension target keeps its options, such as the stage number"
    (is (= ["dimension" [:field 3 nil] {:stage-number 0}]
           (get-in (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                                  {"click_behavior" {"parameterMapping" {"abc" {"target" {"type"      "dimension"
                                                                                          "dimension" ["dimension" ["field" 3 nil] {"stage-number" 0}]}}}}})
                   [:click_behavior :parameterMapping "abc" :target :dimension])))))

(deftest ^:parallel normalize-drops-invalid-values-per-key-test
  (testing "a value that doesn't match its type is dropped without its siblings, at every level"
    (is (= {:column_settings {"[\"name\",\"A\"]" {:currency       "EUR"
                                                  :click_behavior {:type "link" :linkType "url" :linkTemplate "/x"}}}
            :table.columns   [{:name "A" :enabled true :fieldRef [:field 1 nil]}]}
           (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                          {"column_settings" {"[\"name\",\"A\"]" {"currency"       "EUR"
                                                                  "decimals"       "two"
                                                                  "click_behavior" {"type"         "link"
                                                                                    "linkType"     "url"
                                                                                    "linkTemplate" "/x"
                                                                                    "targetId"     "abc"}}}
                           "table.columns"   [{"name" "A" "enabled" true "fieldRef" ["field" 1 nil] "key" "k"}]
                           "table.pivot"     "yes"})))))

(deftest ^:parallel normalize-deprecated-values-test
  (testing "deprecated values are normalized to the ones that replaced them"
    (is (= {:column_settings {"[\"name\",\"A\"]" {:time_style     "HH:mm"
                                                  :click_behavior {:type "link" :linkType "dashboard" :targetId 1}}}
            :click_behavior  {:type "link" :linkType "dashboard" :targetId 2}}
           (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                          {"column_settings" {"[\"name\",\"A\"]" {"time_style"     "k:mm"
                                                                  "click_behavior" {"type" "link" "linkType" "page" "targetId" 1}}}
                           "click_behavior"  {"type" "link" "linkType" "page" "targetId" 2}})))))

(deftest ^:parallel normalize-pie-percent-visibility-test
  (testing "the pie legend settings of older settings become the percent visibility they mean"
    (are [settings expected] (= expected
                                (:pie.percent_visibility
                                 (lib/normalize ::lib.schema.visualization-settings/visualization-settings settings)))
      {"pie.show_legend" true}                                  "inside"
      {"pie.show_legend" false "pie.show_legend_perecent" true} "legend"
      {"pie.show_legend" true "pie.percent_visibility" "off"}   "off"
      {"pie.show_legend" false}                                 nil)))

(deftest ^:parallel api-decode-removes-qp-keys-test
  (testing "the keys the query processor adds are never accepted from the REST API"
    (is (= {"table.pivot" true}
           (mc/decode ::lib.schema.visualization-settings/visualization-settings
                      {"table.pivot" true "qp/display" "table" "qp/global-column-settings" {}}
                      (mtx/transformer {:name :api}))))))

(deftest ^:parallel normalize-keeps-click-behavior-parameter-mapping-shapes-test
  (testing "the ids and types of parameter mappings the backend doesn't read are kept as the frontend wrote them"
    (let [mapping {"id"     ["[\"dimension\",[\"field\",1,null]]"]
                   "source" {"type" "userAttribute" "id" "attr_uid" "name" "attr_uid"}
                   "target" {"type" "dimension"
                             "id"   ["[\"dimension\",[\"field\",1,null]]"]
                             "dimension" ["dimension" ["field" 1 nil]]}}]
      (is (= {:id     ["[\"dimension\",[\"field\",1,null]]"]
              :source {:type "userAttribute" :id "attr_uid" :name "attr_uid"}
              :target {:type      "dimension"
                       :id        ["[\"dimension\",[\"field\",1,null]]"]
                       :dimension ["dimension" [:field 1 nil]]}}
             (get-in (lib/normalize ::lib.schema.visualization-settings/visualization-settings
                                    {"click_behavior" {"type" "link" "parameterMapping" {"k" mapping}}})
                     [:click_behavior :parameterMapping "k"]))))))
