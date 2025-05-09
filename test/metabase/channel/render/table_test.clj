(ns metabase.channel.render.table-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [hickory.select :as hik.s]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.render.js.color :as js.color]
   [metabase.channel.render.table :as table]
   [metabase.formatter :as formatter]
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
  (let [columns       [{:name "a"} {:name "b"} {:name "c"}]
        query-results {:cols columns
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
           (-> (js.color/make-color-selector query-results (:visualization_settings render.tu/test-card))
               (#'table/render-table {:col-names             ["a" "b" "c"]
                                      :cols-for-color-lookup ["a" "b" "c"]} (query-results->header+rows query-results) columns nil nil)
               find-table-body
               cell-value->background-color)))))

(deftest header-truncation-test []
  (let [[normal-heading long-heading :as row] ["Count" (apply str (repeat 120 "A"))]
        [normal-rendered long-rendered]       (->> (#'table/render-table-head row {:row row} nil {} false)
                                                   (tree-seq vector? rest)
                                                   (#(nth % 3))
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
                                 "0.6666667 AS E, "
                                 "'https://example.com/image.jpg' AS F;")
          formatting-viz    {:table.column_widths [50 50 50 50 50 50]
                             :column_settings
                             {"[\"name\",\"A\"]" {:column_title "Eh"
                                                  :number_style "percent"
                                                  :text_wrapping true}
                              "[\"name\",\"B\"]" {:column_title "Bee"
                                                  :number_style "scientific"
                                                  :text_align   "middle"}
                              "[\"name\",\"C\"]" {:column_title "Sea"
                                                  :date_style   "D/M/YYYY"}
                              "[\"name\",\"D\"]" {:column_title "D"
                                                  :prefix       "---"
                                                  :suffix       "___"}
                              "[\"name\",\"E\"]" {:column_title "E"
                                                  :decimals     3}
                              "[\"name\",\"F\"]" {:column_title "Eff"
                                                  :view_as     "image"}}}
          disabled-cols-viz {:table.columns
                             [{:name "B" :enabled true}
                              {:name "A" :enabled true}
                              {:name "C" :enabled false}
                              {:name "D" :enabled false}
                              {:name "E" :enabled false}]}
          expected-img-cell {:type :element,
                             :attrs
                             {:src "https://example.com/image.jpg",
                              :style "max-width: 100%; max-height: 30px; object-fit: contain; display: block;"},
                             :tag :img,
                             :content nil}]
      (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query          {:database (mt/id)
                                                                                  :type     :native
                                                                                  :native   {:query q}}
                                                         :visualization_settings formatting-viz}]
        (testing "Custom column titles and column format settings are respected in render."
          (let [doc     (render.tu/render-card-as-hickory! card-id)
                row-els (hik.s/select (hik.s/tag :tr) doc)]
            (is (= [["Eh" "Bee" "Sea" "D" "E" "Eff"]
                    ["10%" "9E3" "12/10/2022" "---0.12___" "0.667" expected-img-cell]]
                   (mapv (fn [row-el] (mapcat :content (:content row-el))) row-els)))))
        (testing "Site Localization Settings are respected in columns."
          (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_style      "D/M/YYYY"
                                                                                :date_separator  "-"
                                                                                :date_abbreviate false}
                                                                :type/Number   {:number_separators ",."}}]
            (let [doc     (render.tu/render-card-as-hickory! card-id)
                  row-els (hik.s/select (hik.s/tag :tr) doc)]
              (is (= [["Eh" "Bee" "Sea" "D" "E" "Eff"]
                      ["10%" "9E3" "12-10-2022" "---0,12___" "0,667" expected-img-cell]]
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
                hiccup-render (:content (channel.render/render-pulse-card :attachment "UTC" card nil data-map))
                header-els    (render.tu/nodes-with-tag hiccup-render :th)]
            (is (= ["A"]
                   (map last header-els)))))
        (testing "Text alignment settings are respected in columns."
          (let [doc     (render.tu/render-card-as-hickory! card-id)
                th-els  (hik.s/select (hik.s/tag :th) doc)
                bee-th  (first (filter #(= "Bee" (first (:content %))) th-els))
                style   (get-in bee-th [:attrs :style])]
            (is (str/includes? style "text-align: center")
                "The 'Bee' column should have center text alignment")))
        (testing "Text wrapping settings are respected in columns."
          (let [doc     (render.tu/render-card-as-hickory! card-id)
                th-els  (hik.s/select (hik.s/tag :th) doc)
                eh-th   (first (filter #(= "Eh" (first (:content %))) th-els))
                style   (get-in eh-th [:attrs :style])]
            (is (and (str/includes? style "white-space: normal")
                     (str/includes? style "min-width: 25px"))
                "The 'Eh' column should have text wrapping enabled with appropriate min-width")))
        (testing "View as image settings are respected in columns."
          (let [doc     (render.tu/render-card-as-hickory! card-id)
                img-els (hik.s/select (hik.s/tag :img) doc)
                first-img (first img-els)
                style   (get-in first-img [:attrs :style])]
            (is (and (some? img-els)
                     (= "https://example.com/image.jpg" (get-in first-img [:attrs :src]))
                     (str/includes? style "max-height: 30px"))
                "The 'F' column should render images with max-height of 30px")))
        (testing "Disabled columns are not rendered, and column re-ordering is respected."
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query          {:database (mt/id)
                                                                             :type     :native
                                                                             :native   {:query q}}
                                                    :visualization_settings disabled-cols-viz}]
            (let [doc     (render.tu/render-card-as-hickory! card-id)
                  row-els (hik.s/select (hik.s/tag :tr) doc)]
              (is (= [["B" "A"]
                      ["9,000" "0.1"]]
                     (mapv (fn [row-el] (mapcat :content (:content row-el))) row-els))))))))))

(deftest table-row-index-column-test
  (mt/dataset test-data
    (let [q                 (str "SELECT "
                                 " 1 AS A, "
                                 " 2 AS B;")
          row-index-viz     {:table.row_index true}]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query q}}
                                                :visualization_settings row-index-viz}]
        (testing "Row index column is included when table.row_index is true"
          (let [doc     (render.tu/render-card-as-hickory! card-id)
                th-els  (hik.s/select (hik.s/tag :th) doc)
                td-els  (hik.s/select (hik.s/tag :td) doc)]
            ;; Check header
            (is (= ["#" "A" "B"]
                   (map #(first (:content %)) th-els))
                "Header should include '#' as first column")
            ;; Check body
            (is (= ["1" "1" "2"]
                   (map #(first (:content %)) td-els))
                "Body should include row indices as first column")))))))

(deftest table-minibar-test
  (mt/dataset test-data
    (let [q                 (str "SELECT 5 AS A, 5 AS B"
                                 " UNION ALL"
                                 " SELECT 10 AS A, 10 AS B")
          q-zero            (str "SELECT 0 AS A"
                                 " UNION ALL"
                                 " SELECT 0 AS A")
          formatting-viz    {:column_settings
                             {"[\"name\",\"A\"]" {:show_mini_bar true}}}]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query q}}
                                                :visualization_settings formatting-viz}]
        (testing "Minibar table structure is correctly rendered"
          (let [doc     (render.tu/render-card-as-hickory! card-id)
                ;; Find all td cells in column A (first column)
                a-column-cells (hik.s/select (hik.s/descendant (hik.s/tag :td) (hik.s/class "pulse-body")) doc)
                first-cell     (first a-column-cells)]
            ;; Verify that the first cell has a nested table
            (is (some? (hik.s/select (hik.s/tag :table) first-cell)))
            ;; Verify the width styling in the first minibar
            (is (some? (hik.s/select (hik.s/attr :style #(when % (re-find #"width: 50%" %))) first-cell))))))
      (mt/with-temp [:model/Card {card-id2 :id} {:dataset_query {:database (mt/id)
                                                                 :type     :native
                                                                 :native   {:query q-zero}}
                                                 :visualization_settings formatting-viz}]
        (testing "Minibar handles 0 gracefully"
          (is (some? (render.tu/render-card-as-hickory! card-id2))))))))

(defn- render-table [dashcard results]
  (channel.render/render-pulse-card :attachment "America/Los_Angeles" render.tu/test-card dashcard results))

(deftest attachment-rows-limit-test
  (doseq [[test-explanation env-var-value expected]
          [["defaults to 20 rows." nil 20]
           ["is respected in table renders when below the default of 20." 5 5]
           ["is respected in table renders when above the default of 20." 25 25]
           ["is set to 20 when the value doesn't make sense." -20 20]
           ["is limited to a max. of 100 rows." 200 100]]]
    (testing (format "The `metabase.settings.deprecated-grab-bag/attachment-rows-limit` %s" test-explanation)
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
