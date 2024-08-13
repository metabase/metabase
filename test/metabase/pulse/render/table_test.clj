(ns metabase.pulse.render.table-test
  (:require
   [clojure.test :refer :all]
   [hickory.select :as hik.s]
   [metabase.formatter :as formatter]
   [metabase.pulse.render :as render]
   [metabase.pulse.render.color :as color]
   [metabase.pulse.render.table :as table]
   [metabase.pulse.render.test-util :as render.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

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
               (#'table/render-table 0 {:col-names             ["a" "b" "c"]
                                        :cols-for-color-lookup ["a" "b" "c"]} (query-results->header+rows query-results))
               find-table-body
               cell-value->background-color)))))

(deftest header-truncation-test []
  (let [[normal-heading long-heading :as row] ["Count" (apply str (repeat 120 "A"))]
        [normal-rendered long-rendered]       (->> (#'table/render-table-head row {:row row})
                                               (tree-seq vector? rest)
                                               (filter #(= :th (first %)))
                                               (map last))]
    (testing "Table Headers are truncated if they are really long."
      (is (= normal-heading normal-rendered))
      (is (= "A..." (subs long-rendered (- (count long-rendered) 4) (count long-rendered))))
      (is (not= long-heading long-rendered)))))

(deftest table-column-formatting-test
  (mt/dataset test-data
    (let [q                 (str "SELECT "
                                 " 0.1 AS A, "
                                 "9000 AS B, "
                                 "'2022-10-12'::date AS C, "
                                 "0.123 AS D, "
                                 "0.6666667 AS E;")
          formatting-viz    {:column_settings
                             {"[\"name\",\"A\"]" {:column_title "Eh"
                                                  :number_style "percent"}
                              "[\"name\",\"B\"]" {:column_title "Bee"
                                                  :number_style "scientific"}
                              "[\"name\",\"C\"]" {:column_title "Sea"
                                                  :date_style   "D/M/YYYY"}
                              "[\"name\",\"D\"]" {:column_title "D"
                                                  :prefix       "---"
                                                  :suffix       "___"}
                              "[\"name\",\"E\"]" {:column_title "E"
                                                  :decimals     3}}}
          disabled-cols-viz {:table.columns
                             [{:name "B" :enabled true}
                              {:name "A" :enabled true}
                              {:name "C" :enabled false}
                              {:name "D" :enabled false}
                              {:name "E" :enabled false}]}]
      (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query          {:database (mt/id)
                                                                                  :type     :native
                                                                                  :native   {:query q}}
                                                         :visualization_settings formatting-viz}]
        (testing "Custom column titles and column format settings are respected in render."
          (let [doc     (render.tu/render-card-as-hickory card-id)
                row-els (hik.s/select (hik.s/tag :tr) doc)]
            (is (= [["Eh" "Bee" "Sea" "D" "E"]
                    ["10%" "9E3" "12/10/2022" "---0.12___" "0.667"]]
                   (mapv (fn [row-el] (mapcat :content (:content row-el))) row-els)))))
        (testing "Site Localization Settings are respected in columns."
          (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_style      "D/M/YYYY"
                                                                                :date_separator  "-"
                                                                                :date_abbreviate false}
                                                                :type/Number   {:number_separators ",."}}]
            (let [doc     (render.tu/render-card-as-hickory card-id)
                  row-els (hik.s/select (hik.s/tag :tr) doc)]
              (is (= [["Eh" "Bee" "Sea" "D" "E"]
                      ["10%" "9E3" "12-10-2022" "---0,12___" "0,667"]]
                     (mapv (fn [row-el] (mapcat :content (:content row-el))) row-els))))))
        (testing "Visibility type on Fields is respected."
          (let [data-map      {:data {:cols [{:name            "A"
                                              :display_name    "A"
                                              :base_type       :type/Number
                                              :visibility_type :normal
                                              :semantic_type   nil}
                                             {:name            "B"
                                              :display_name    "B"
                                              :base_type       :type/Number
                                              :visibility_type :sensitive
                                              :semantic_type   nil}]
                                      :rows [[1 2]]}}
                hiccup-render (:content (render/render-pulse-card :attachment "UTC" card nil data-map))
                header-els    (render.tu/nodes-with-tag hiccup-render :th)]
            (is (= ["A"]
                   (map last header-els))))))
      (testing "Disabled columns are not rendered, and column re-ordering is respected."
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query          {:database (mt/id)
                                                                           :type     :native
                                                                           :native   {:query q}}
                                                  :visualization_settings disabled-cols-viz}]
          (let [doc     (render.tu/render-card-as-hickory card-id)
                row-els (hik.s/select (hik.s/tag :tr) doc)]
            (is (= [["B" "A"]
                    ["9,000" "0.1"]]
                   (mapv (fn [row-el] (mapcat :content (:content row-el))) row-els)))))))))

(defn- render-table [dashcard results]
  (render/render-pulse-card :attachment "America/Los_Angeles" render.tu/test-card dashcard results))

(deftest attachment-rows-limit-test
  (doseq [[test-explanation env-var-value expected]
          [["defaults to 20 rows." nil 20]
           ["is respected in table renders when below the default of 20." 5 5]
           ["is respected in table renders when above the default of 20." 25 25]
           ["is set to 20 when the value doesn't make sense." -20 20]
           ["is limited to a max. of 100 rows." 200 100]]]
    (testing (format "The `metabase.public-settings/attachment-rows-limit` %s" test-explanation)
      (mt/with-temp-env-var-value! ["MB_ATTACHMENT_TABLE_ROW_LIMIT" env-var-value]
        (is (= expected
               (count (-> (render-table
                           {:visualization_settings {:table.columns
                                                     [{:name "a" :enabled true}]}}
                           {:data {:cols [{:name         "a",
                                           :display_name "a",
                                           :base_type    :type/BigInteger
                                           :semantic_type nil}]
                                   :rows (repeat 200 ["I will keep default limits."])}})
                          :content
                          (render.tu/nodes-with-text "I will keep default limits.")))))))))
