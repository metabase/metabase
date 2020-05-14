(ns metabase.query-processor.streaming.xlsx
  (:require [cheshire.core :as json]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [java-time :as t]
            [metabase.query-processor.streaming
             [common :as common]
             [interface :as i]]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [tru]]])
  (:import java.io.OutputStream
           org.apache.poi.ss.usermodel.Cell
           org.apache.poi.xssf.streaming.SXSSFWorkbook))

(defmethod i/stream-options :xlsx
  [_]
  {:content-type              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   :write-keepalive-newlines? false
   :headers                   {"Content-Disposition" (format "attachment; filename=\"query_result_%s.xlsx\""
                                                             (u.date/format (t/zoned-date-time)))}})

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.middleware`.
(defmethod spreadsheet/set-cell! Object [^Cell cell, value]
  (when (= (.getCellType cell) Cell/CELL_TYPE_FORMULA)
    (.setCellType cell Cell/CELL_TYPE_STRING))
  ;; stick the object in a JSON map and encode it, which will force conversion to a string. Then unparse that JSON and
  ;; use the resulting value as the cell's new String value.  There might be some more efficient way of doing this but
  ;; I'm not sure what it is.
  (.setCellValue cell (str (-> (json/generate-string {:v value})
                               (json/parse-string keyword)
                               :v))))

;; TODO -- this is obviously not streaming! SAD!
(defmethod i/streaming-results-writer :xlsx
  [_ ^OutputStream os]
  (let [workbook (SXSSFWorkbook.)
        sheet    (spreadsheet/add-sheet! workbook (tru "Query result"))]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [cols]} :data}]
        (spreadsheet/add-row! sheet (map (some-fn :display_name :name) cols)))

      (write-row! [_ row _]
        (spreadsheet/add-row! sheet (map common/format-value row)))

      (finish! [_ _]
        (spreadsheet/save-workbook-into-stream! os workbook)
        (.dispose workbook)
        (.close os)))))
