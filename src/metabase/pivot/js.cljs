(ns metabase.pivot.js
  "Javascript-facing interface for pivot table postprocessing. Wraps functions in metabase.pivot.core."
  (:require
   [metabase.pivot.core :as pivot]))

(defn ^:export columns-without-pivot-group
  "Removes the pivot-grouping column from a list of columns, identifying it by name."
  [cols]
  (let [cols (js->clj cols :keywordize-keys true)]
    (clj->js
     (pivot/columns-without-pivot-group cols))))

(defn ^:export split-pivot-data
  "Pulls apart different aggregations that were packed into one result set returned from the QP.
  The pivot-grouping column indicates which breakouts were used to compute a given row. We used that column
  to split apart the data and convert field refs to indices"
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
  (let [data         (js->clj data :keywordize-keys true)
        row-indexes  (js->clj row-indexes)
        col-indexes  (js->clj col-indexes)
        val-indexes  (js->clj val-indexes)
        cols         (js->clj cols :keywordize-keys true)
        settings     (js->clj settings :keywordize-keys true)
        col-settings (js->clj col-settings :keywordize-keys true)
        ;; On the FE, always format rows (false only applies to downloads)
        format-rows? true
        result       (pivot/process-pivot-table data
                                                row-indexes
                                                col-indexes
                                                val-indexes
                                                cols
                                                top-formatters
                                                left-formatters
                                                value-formatters
                                                format-rows?
                                                settings
                                                col-settings
                                                make-color-getter)]
    (clj->js result)))
