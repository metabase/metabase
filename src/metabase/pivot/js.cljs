(ns metabase.pivot.js
  "Javascript-facing interface for pivot table postprocessing. Wraps functions in metabase.pivot.core."
  (:require
   [metabase.pivot.core :as pivot]))

(defn ^:export split-pivot-data
  "TODO"
  [data]
  (let [{:keys [pivot-data columns]}
        (pivot/split-pivot-data (js->clj data :keywordize-keys true))]
    (clj->js
     {:pivotData pivot-data
      :columns   columns})))

(defn ^:export process-pivot-table
  "Formats rows, columns, and measure values in a pivot table according to
  provided formatters."
  [pivot-data row-indexes col-indexes val-indexes cols top-formatters left-formatters value-formatters settings col-settings color-getter]
  (let [pivot-data (js->clj pivot-data)
        row-indexes (js->clj row-indexes)
        col-indexes (js->clj col-indexes)
        val-indexes (js->clj val-indexes)
        cols (js->clj cols :keywordize-keys true)
        settings (js->clj settings :keywordize-keys true)
        col-settings (js->clj col-settings :keywordize-keys true)]
    (clj->js (pivot/process-pivot-table pivot-data row-indexes col-indexes val-indexes cols top-formatters left-formatters value-formatters settings col-settings color-getter))))
