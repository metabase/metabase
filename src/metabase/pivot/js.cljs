(ns metabase.pivot.js
  "Javascript-facing interface for pivot table postprocessing. Wraps functions in metabase.pivot.core."
  (:require
   [metabase.pivot.core :as pivot]))

(defn ^:export column-split-indexes
  "Converts names of columns in `column-split` to indices into `columns-without-pivot-group`.
    e.g. {:rows [\"CREATED_AT\"], :columns [\"RATING\"], :values [\"count\"]}
    ->   {:rows [1] :columns [0] :values [2]}"
  [column-split cols]
  (let [column-split (js->clj column-split :keywordize-keys true)
        cols         (js->clj cols :keywordize-keys true)]
    (clj->js
     (pivot/column-split->indexes column-split cols))))

(defn ^:export columns-without-pivot-group
  [cols]
  (let [cols (js->clj cols :keywordize-keys true)]
    (clj->js
     (pivot/columns-without-pivot-group cols))))

(defn ^:export split-pivot-data
  ""
  [data]
  (let [{:keys [pivot-data primary-rows-key columns]}
        (pivot/split-pivot-data (js->clj data :keywordize-keys true))]
    (clj->js
     {:pivotData pivot-data
      :primaryRowsKey (str primary-rows-key)
      :columns columns})))

(defn ^:export process-pivot-table
  "Formats rows, columns, and measure values in a pivot table according to
  provided formatters."
  [data row-indexes col-indexes val-indexes cols top-formatters left-formatters value-formatters settings col-settings make-color-getter]
  (let [data (js->clj data :keywordize-keys true)
        row-indexes (js->clj row-indexes)
        col-indexes (js->clj col-indexes)
        val-indexes (js->clj val-indexes)
        cols (js->clj cols :keywordize-keys true)
        settings (js->clj settings :keywordize-keys true)
        col-settings (js->clj col-settings :keywordize-keys true)]
    (clj->js (pivot/process-pivot-table data row-indexes col-indexes val-indexes cols top-formatters left-formatters value-formatters settings col-settings make-color-getter))))
