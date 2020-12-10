(ns metabase.query-processor.streaming.xlsx
  (:require [cheshire.core :as json]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [java-time :as t]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [tru]]])
  (:import java.io.OutputStream
           [java.time LocalDate LocalDateTime OffsetDateTime ZonedDateTime]
           [org.apache.poi.ss.usermodel Cell CellType Workbook]
           org.apache.poi.xssf.streaming.SXSSFWorkbook))

(def ^:private ^:dynamic *results-timezone-id* "UTC")

(defmethod i/stream-options :xlsx
  [_]
  {:content-type              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   :write-keepalive-newlines? false
   :status                    200
   :headers                   {"Content-Disposition" (format "attachment; filename=\"query_result_%s.xlsx\""
                                                             (u.date/format (t/zoned-date-time)))}})

;; docjure has an open issue about its formatting issues: https://github.com/mjul/docjure/issues/75
;; since this hasn't been addressed at the library level, we have to do some workarounds

;; this method is private in the docjure library, but we need to able to call it from here
;; also, the version in Docjure doesn't keep track of created cell styles, which is bad
;; these need to be memoized per Workbook

(def ^:dynamic *cell-styles*
  "Holds the CellStyle values used within a spreadsheet so that they can be reused. Excel has a limit
   of 64,000 cell styles in a single workbook."
  nil)

(defn- create-or-get-date-format [^Workbook workbook ^String format-string]
  (when-not (contains? @*cell-styles* format-string)
    (let [new-val (let [format-helper (.getCreationHelper workbook)
                        date-style (.createCellStyle workbook)]
                    (assoc
                     @*cell-styles*
                     format-string
                     (doto date-style
                       (.setDataFormat (.. format-helper createDataFormat (getFormat format-string))))))]
      (swap! *cell-styles* (constantly new-val))))
  (get @*cell-styles* format-string))

;; the docjure library does not handle the difference between a date and date+time column
;; as a result, we'll add overrides that can do it
(intern 'dk.ative.docjure.spreadsheet 'create-date-format create-or-get-date-format)

(def ^:const date-format
  "Standard date format for :type/Date objects"
  "m/d/yy")

(def ^:const datetime-format
  "Standard date/time format for any of the :type/Date variants with a Time"
  "m/d/yy HH:MM:ss")

(defn- set-cell! [^Cell cell format-string date]
  (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/NUMERIC))
  (.setCellValue cell ^java.util.Date date)
  (.setCellStyle cell (create-or-get-date-format (.. cell getSheet getWorkbook) format-string)))

(defn- apply-timezone [t]
  (u.date/with-time-zone-same-instant t (t/zone-id *results-timezone-id*)))

(defmethod spreadsheet/set-cell! LocalDate
  [^Cell cell t]
  (set-cell! cell date-format (t/java-date (apply-timezone t))))

(defmethod spreadsheet/set-cell! LocalDateTime
  [^Cell cell t]
  (spreadsheet/set-cell! cell (t/java-date (apply-timezone t))))

(defmethod spreadsheet/set-cell! ZonedDateTime
  [^Cell cell t]
  (set-cell! cell datetime-format (t/java-date (apply-timezone t))))

(defmethod spreadsheet/set-cell! OffsetDateTime
  [^Cell cell t]
  (set-cell! cell datetime-format (t/java-date (apply-timezone t))))

;; overrides the default implementation from docjure, so that a plain Date object
;; carries its time too
(defmethod spreadsheet/set-cell! java.util.Date
  [^Cell cell val]
  (set-cell! cell datetime-format val))

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.middleware`.
(defmethod spreadsheet/set-cell! Object
  [^Cell cell, value]
  (when (= (.getCellType cell) CellType/FORMULA)
    (.setCellType cell CellType/STRING))
  ;; stick the object in a JSON map and encode it, which will force conversion to a string. Then unparse that JSON and
  ;; use the resulting value as the cell's new String value.  There might be some more efficient way of doing this but
  ;; I'm not sure what it is.
  (.setCellValue cell (str (-> (json/generate-string {:v value})
                               (json/parse-string keyword)
                               :v))))

(defmethod i/streaming-results-writer :xlsx
  [_ ^OutputStream os]
  (let [workbook         (SXSSFWorkbook.)
        cell-styles      (atom {})
        sheet            (spreadsheet/add-sheet! workbook (tru "Query result"))
        results-timezone (atom nil)]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [cols]} :data}]
        ;; avoid circular refs
        (classloader/require 'metabase.query-processor.timezone)
        (reset! results-timezone ((resolve 'metabase.query-processor.timezone/results-timezone-id)))
        (spreadsheet/add-row! sheet (map (some-fn :display_name :name) cols)))

      (write-row! [_ row _]
        (binding [*cell-styles*      cell-styles
                  *results-timezone-id* @results-timezone]
          (spreadsheet/add-row! sheet row)))

      (finish! [_ _]
        (spreadsheet/save-workbook-into-stream! os workbook)
        (.dispose workbook)
        (.close os)))))
