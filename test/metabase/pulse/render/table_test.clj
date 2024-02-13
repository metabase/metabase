(ns metabase.pulse.render.table-test
  (:require
   [clojure.test :refer :all]
   [metabase.formatter :as formatter]
   [metabase.pulse.render :as render]
   [metabase.pulse.render.color :as color]
   [metabase.pulse.render.table :as table]
   [metabase.pulse.render.test-util :as render.tu]
   [metabase.test :as mt]))

(defn- query-results->header+rows
  "Makes pulse header and data rows with no bar-width. Including bar-width just adds extra HTML that will be ignored."
  [{:keys [cols rows]}]
  (for [row-values (cons (map :name cols) rows)]
    {:row row-values
     :bar-width nil}))

(defn- postwalk-collect
  "Invoke `collect-fn` on each node satisfying `pred`. If `collect-fn` returns a value, accumulate that and return the
  results."
  [pred collect-fn form]
  (let [results (atom [])]
    (mt/postwalk-pred pred
                      (fn [node]
                        (when-let [result (collect-fn node)]
                          (swap! results conj result))
                        node)
                      form)
    @results))

(defn- find-table-body
  "Given the hiccup data structure, find the table body and return it"
  [results]
  (postwalk-collect (every-pred vector? #(= :tbody (first %)))
                    ;; The Hiccup form is [:tbody (...rows...)], so grab the second item
                    second
                    results))

(defn- style-map->background-color
  "Finds the background color in the style string of a Hiccup style map"
  [{:keys [style]}]
  (let [[_ color-str] (re-find #".*background-color: ([^;]*);" style)]
    color-str))

(defn- cell-value->background-color
  "Returns a map of cell values to background colors of the pulse table found in the hiccup `results` data
  structure. This only includes the data cell values, not the header values."
  [results]
  (into {} (postwalk-collect (every-pred vector? #(= :td (first %)))
                             (fn [[_ style-map cell-value]]
                               [cell-value (style-map->background-color style-map)])
                             results)))

;; Smoke test for background color selection. Background color decided by some shared javascript code. It's being
;; invoked and included in the cell color of the pulse table. This is somewhat fragile code as the only way to find
;; that style information is to crawl the clojure-ized HTML datastructure and pick apart the style string associated
;; with the cell value. The script right now is hard coded to always return #ff0000. Once the real script is in place,
;; we should find some similar basic values that can rely on. The goal isn't to test out the javascript choosing in
;; the color (that should be done in javascript) but to verify that the pieces are all connecting correctly
(deftest background-color-selection-smoke-test
  (let [query-results {:cols [{:name "a"} {:name "b"} {:name "c"}]
                       :rows [[1 2 3]
                              [4 5 6]
                              [7 8 9]
                              [7 8 (formatter/map->NumericWrapper {:num-str "4.5" :num-value 4.5})]
                              [7 8 (formatter/map->NumericWrapper {:num-str "1,001.5" :num-value 1001.5})]    ;; default floating point seperator .
                              [7 8 (formatter/map->NumericWrapper {:num-str "1.001,5" :num-value 1001.5})]]}] ;; floating point seperator is ,
    (is (= {"1"       nil
            "2"       nil
            "3"       "rgba(0, 255, 0, 0.75)"
            "4"       nil
            "4.5"     "rgba(0, 191, 64, 0.75)"
            "5"       nil
            "6"       "rgba(0, 128, 128, 0.75)"
            "7"       "rgba(255, 0, 0, 0.65)"
            "8"       "rgba(255, 0, 0, 0.2)"
            "9"       "rgba(0, 0, 255, 0.75)"
            "1.001,5" "rgba(0, 0, 255, 0.75)"
            "1,001.5" "rgba(0, 0, 255, 0.75)"}
           (-> (color/make-color-selector query-results (:visualization_settings render.tu/test-card))
               (#'table/render-table 0 ["a" "b" "c"] (query-results->header+rows query-results))
               find-table-body
               cell-value->background-color)))))

(deftest header-truncation-test []
  (let [[normal-heading long-heading :as row] ["Count" (apply str (repeat 120 "A"))]
        [normal-rendered long-rendered]       (->> (#'table/render-table-head {:row row})
                                               (tree-seq vector? rest)
                                               (filter #(= :th (first %)))
                                               (map last))]
    (testing "Table Headers are truncated if they are really long."
      (is (= normal-heading normal-rendered))
      (is (= "A..." (subs long-rendered (- (count long-rendered) 4) (count long-rendered))))
      (is (not= long-heading long-rendered)))))

(deftest table-columns-test
  (let [rows [["As" "Bs" "Cs"]
              ["a" "b" "c"]]]
    (testing "Column reordering is applied correctly to the table"
      (let [{:keys [viz-tree]} (render.tu/make-viz-data
                                rows :table {:reordered-columns {:order [1 0 2]}})]
        (is (= ["Bs" "As" "Cs" "b" "a" "c"]
               (-> viz-tree
                   render.tu/remove-attrs
                   ((juxt #(render.tu/nodes-with-tag % :th)
                          #(render.tu/nodes-with-tag % :td)))
                   (->> (apply concat))
                   (->> (map second)))))))
    (testing "A table with hidden columns does not render hidden columns"
      (let [{:keys [viz-tree]} (render.tu/make-viz-data
                                rows :table {:hidden-columns {:hide [1]}})]
        (is (= ["As" "Cs" "a" "c"]
               (-> viz-tree
                   render.tu/remove-attrs
                   ((juxt #(render.tu/nodes-with-tag % :th)
                          #(render.tu/nodes-with-tag % :td)))
                   (->> (apply concat))
                   (->> (map second)))))))))

(deftest table-column-formatting-test
  (let [rows [["A" "B" "C" "D" "E"]
              [0.1 9000 "2022-10-12T00:00:00Z" 0.123 0.6666667]]]
    (testing "Custom column titles are respected in render."
      (is (= ["Eh" "Bee" "Sea" "D" "E"]
             (-> rows
                 (render.tu/make-card-and-data :table)
                 (render.tu/make-column-settings [{:column-title "Eh"}
                                                  {:column-title "Bee"}
                                                  {:column-title "Sea"}])
                 render.tu/render-as-hiccup
                 render.tu/remove-attrs
                 (render.tu/nodes-with-tag :th)
                 (->> (map second))))))
    (testing "Column format settings are respected in render."
      (is (= ["10%" "9E3" "12/10/2022" "---0.12___" "0.667"]
             (-> rows
                 (render.tu/make-card-and-data :table)
                 (render.tu/make-column-settings [{:number-style "percent"}
                                                  {:number-style "scientific"}
                                                  {:date-style "D/M/YYYY"}
                                                  {:prefix "---" :suffix "___"}
                                                  {:decimals 3}])
                 render.tu/render-as-hiccup
                 render.tu/remove-attrs
                 (render.tu/nodes-with-tag :td)
                 (->> (map second))))))
    (testing "Site Localization Settings are respected in columns."
      (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_style      "D/M/YYYY"
                                                                            :date_separator  "-"
                                                                            :date_abbreviate false}
                                                            :type/Number   {:number_separators ",."}}]
        (is (= ["0,1" "9.000" "12-10-2022" "0,12" "0,67"]
             (-> rows
                 (render.tu/make-card-and-data :table)
                 render.tu/render-as-hiccup
                 render.tu/remove-attrs
                 (render.tu/nodes-with-tag :td)
                 (->> (map second)))))))))

(defn- render-table [dashcard results]
  (render/render-pulse-card :attachment "America/Los_Angeles" render.tu/test-card dashcard results))

(deftest render-table-columns-test
  (testing "Disabling a column has the same effect as not having the column at all."
    (is (=
         (render-table
          {:visualization_settings {:table.columns
                                    [{:name "b" :enabled true}]}}
          {:data {:cols [{:name         "b",
                          :display_name "b",
                          :base_type    :type/BigInteger
                          :semantic_type nil}]
                  :rows [[2] [4]]}})
         (render-table
          {:visualization_settings {:table.columns
                                    [{:name "a" :enabled false}
                                     {:name "b" :enabled true}]}}
          {:data {:cols [{:name         "a",
                          :display_name "a",
                          :base_type    :type/BigInteger
                          :semantic_type nil}
                         {:name         "b",
                          :display_name "b",
                          :base_type    :type/BigInteger
                          :semantic_type nil}]
                  :rows [[1 2] [3 4]]}}))))
  (testing "Column order in table.columns is respected."
    (is (=
         (render-table
          {:visualization_settings {:table.columns
                                    [{:name "b" :enabled true}
                                     {:name "a" :enabled true}]}}
          {:data {:cols [{:name         "a",
                          :display_name "a",
                          :base_type    :type/BigInteger
                          :semantic_type nil}
                         {:name         "b",
                          :display_name "b",
                          :base_type    :type/BigInteger
                          :semantic_type nil}]
                  :rows [[1 2] [3 4]]}})
         (render-table
          {:visualization_settings {:table.columns
                                    [{:name "b" :enabled true}
                                     {:name "a" :enabled true}]}}
          {:data {:cols [{:name         "b",
                          :display_name "b",
                          :base_type    :type/BigInteger
                          :semantic_type nil}
                         {:name         "a",
                          :display_name "a",
                          :base_type    :type/BigInteger
                          :semantic_type nil}]
                  :rows [[2 1] [4 3]]}}))))
    (testing "visibility_type is respected in render."
    (is (=
         (render-table
          {:visualization_settings {:table.columns
                                    [{:name "a" :enabled true}
                                     {:name "b" :enabled true}]}}
          {:data {:cols [{:name            "a",
                          :display_name    "a",
                          :base_type       :type/BigInteger
                          :visibility_type :normal
                          :semantic_type   nil}
                         {:name            "b",
                          :display_name    "b",
                          :base_type       :type/BigInteger
                          :visibility_type :details-only
                          :semantic_type   nil}]
                  :rows [[1 2] [3 4]]}})
         (render-table
          {:visualization_settings {:table.columns
                                    [{:name "a" :enabled true}]}}
          {:data {:cols [{:name         "a",
                          :display_name "a",
                          :base_type    :type/BigInteger
                          :semantic_type nil}]
                  :rows [[1 2] [3 4]]}})))))
