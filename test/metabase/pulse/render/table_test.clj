(ns metabase.pulse.render.table-test
  (:require [expectations :refer [expect]]
            [metabase.pulse.render
             [color :as color]
             [table :as table]
             [test-util :as render.tu]]
            [metabase.test.util :as tu]))

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
    (tu/postwalk-pred pred
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
(expect
  {"1" nil,                    "2" nil,                    "3" "rgba(0, 255, 0, 0.75)"
   "4" nil,                    "5" nil,                    "6" "rgba(0, 128, 128, 0.75)"
   "7" "rgba(255, 0, 0, 0.65)" "8" "rgba(255, 0, 0, 0.2)"  "9" "rgba(0, 0, 255, 0.75)"}
  (let [query-results {:cols [{:name "a"} {:name "b"} {:name "c"}]
                       :rows [[1 2 3]
                              [4 5 6]
                              [7 8 9]]}]
    (-> (color/make-color-selector query-results (:visualization_settings render.tu/test-card))
        (#'table/render-table ["a" "b" "c"] (query-results->header+rows query-results))
        find-table-body
        cell-value->background-color)))
