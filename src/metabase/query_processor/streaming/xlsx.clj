(ns metabase.query-processor.streaming.xlsx
  (:require [cheshire.core :as json]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [java-time :as t]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [tru]]])
  (:import java.io.OutputStream
           [java.time LocalDate LocalDateTime OffsetDateTime ZonedDateTime]
           java.util.Date
           [org.apache.poi.ss.usermodel Cell CellType Workbook]
           org.apache.poi.xssf.streaming.SXSSFWorkbook))

(defmethod i/stream-options :xlsx
  [_]
  {:content-type              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   :write-keepalive-newlines? false
   :headers                   {"Content-Disposition" (format "attachment; filename=\"query_result_%s.xlsx\""
                                                             (u.date/format (t/zoned-date-time)))}})

;; docjure has an open issue about its formatting issues: https://github.com/mjul/docjure/issues/75
;; since this hasn't been addressed at the library level, we have to do some workarounds

;; this method is private in the docjure library, but we need to able to call it from here
(defn- ^:dynamic create-date-format [^Workbook workbook ^String format-string]
  (let [date-style (.createCellStyle workbook)
        format-helper (.getCreationHelper workbook)]
    (doto date-style
          (.setDataFormat (.. format-helper createDataFormat (getFormat format-string))))))

;; the docjure library does not handle the difference between a date and date+time column
;; as a result, we'll add overrides that can do it
(intern 'dk.ative.docjure.spreadsheet 'create-date-format create-date-format)

(defmethod spreadsheet/set-cell! LocalDate [^Cell cell val]
  (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/NUMERIC))
  (.setCellValue cell ^Date (t/java-date (t/zoned-date-time val (t/zone-id))))
  (.setCellStyle cell (create-date-format (.. cell getSheet getWorkbook) "m/d/yy")))

(defmethod spreadsheet/set-cell! LocalDateTime [^Cell cell val]
  (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/NUMERIC))
  (.setCellValue cell ^Date (t/java-date (t/zoned-date-time val (t/zone-id))))
  (.setCellStyle cell (create-date-format (.. cell getSheet getWorkbook) "m/d/yy HH:mm:ss")))

(defmethod spreadsheet/set-cell! ZonedDateTime [^Cell cell val]
  (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/NUMERIC))
  (.setCellValue cell ^Date (t/java-date val))
  (.setCellStyle cell (create-date-format (.. cell getSheet getWorkbook) "m/d/yy HH:mm:ss")))

(defmethod spreadsheet/set-cell! OffsetDateTime [^Cell cell val]
  (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/NUMERIC))
  (.setCellValue cell ^Date (t/java-date val))
  (.setCellStyle cell (create-date-format (.. cell getSheet getWorkbook) "m/d/yy HH:mm:ss")))

;; overrides the default implementation from docjure, so that a plain Date object
;; carries its time too
(defmethod spreadsheet/set-cell! Date [^Cell cell val]
  (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/NUMERIC))
  (.setCellValue cell ^Date val)
  (.setCellStyle cell (create-date-format (.. cell getSheet getWorkbook) "m/d/yy HH:mm:ss")))

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.middleware`.
(defmethod spreadsheet/set-cell! Object [^Cell cell, value]
  (when (= (.getCellType cell) CellType/FORMULA)
    (.setCellType cell CellType/STRING))
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
        (spreadsheet/add-row! sheet row))

      (finish! [_ _]
        (spreadsheet/save-workbook-into-stream! os workbook)
        (.dispose workbook)
        (.close os)))))
