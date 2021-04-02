(ns metabase.query-processor.streaming.xlsx
  (:require [cheshire.core :as json]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [java-time :as t]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.streaming.common :as common]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [tru]])
  (:import java.io.OutputStream
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [org.apache.poi.ss.usermodel BuiltinFormats Cell CellType DateUtil Workbook]
           org.apache.poi.xssf.streaming.SXSSFWorkbook))

(defmethod i/stream-options :xlsx
  [_]
  {:content-type              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   :write-keepalive-newlines? false
   :status                    200
   :headers                   {"Content-Disposition" (format "attachment; filename=\"query_result_%s.xlsx\""
                                                             (u.date/format (t/zoned-date-time)))}})

(def ^:dynamic *cell-styles*
  "Holds the CellStyle values used within a spreadsheet so that they can be reused. Excel has a limit
   of 64,000 cell styles in a single workbook."
  nil)

;; Since we can only have a limited number of styles we'll enumerate the possible styles we'll want to use. Then we'll
;; create a bunch of delays for them that will create them if needed and bind this to `*cell-styles*`; we'll use them
;; as needed in various `set-cell!` method impls.

(def ^:private ^{:arglists '(^String [style-name])} cell-style->format-string
  "Predefined cell format strings. These are used to get the corresponding predefined cell format number using
  `BuiltinFormats/getBuiltinFormat`. See `(BuiltinFormats/getAll)` for all predefined formats"
  {:date     "m/d/yy"
   :datetime "m/d/yy h:mm"
   :time     "h:mm:ss"})

(defn- cell-format
  "Fetch the predefined cell format integer associated with `style-name`."
  ^Integer [style-name]
  (or (some-> style-name cell-style->format-string BuiltinFormats/getBuiltinFormat)
      (throw (ex-info (tru "Invalid cell format")
                      {:type          qp.error-type/qp
                       :style-name    style-name
                       :known-formats cell-style->format-string
                       :all-formats   (BuiltinFormats/getAll)}))))

(defn- cell-style-delays
  "Create a map of style name -> delay. This is bound to `*cell-styles*` by `streaming-results-writer`. Dereffing the
  delay will create the style and add it to the workbook if needed."
  [^Workbook workbook]
  (into {} (for [style-name (keys cell-style->format-string)]
             [style-name (delay
                           (doto (.createCellStyle workbook)
                             (.setDataFormat (cell-format style-name))))])))

(defn- cell-style
  "Get the cell style associated with `style-name` by dereffing the delay in `*cell-styles*`."
  ^org.apache.poi.ss.usermodel.CellStyle [style-name]
  (some-> style-name *cell-styles* deref))

;; Temporal values in Excel are just NUMERIC cells that are stored in a floating-point format and have some cell
;; styles applied that dictate how to format them

(defmethod spreadsheet/set-cell! LocalDate
  [^Cell cell ^LocalDate t]
  (.setCellValue cell t)
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (cell-style :date)))

(defmethod spreadsheet/set-cell! LocalDateTime
  [^Cell cell ^LocalDateTime t]
  (.setCellValue cell t)
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (cell-style :datetime)))

(defmethod spreadsheet/set-cell! LocalTime
  [^Cell cell t]
  ;; there's no `.setCellValue` for a `LocalTime` -- but all the built-in impls for `LocalDate` and `LocalDateTime` do
  ;; anyway is convert the date(time) to an Excel datetime floating-point number and then set that.
  ;;
  ;; `DateUtil/convertTime` will convert a *time* string to an Excel number; after that we can set the numeric value
  ;; directly.
  ;;
  ;; See https://poi.apache.org/apidocs/4.1/org/apache/poi/ss/usermodel/DateUtil.html#convertTime-java.lang.String-
  (.setCellValue cell (DateUtil/convertTime (u.date/format "HH:mm:ss" t)))
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (cell-style :time)))

(defmethod spreadsheet/set-cell! OffsetTime
  [cell t]
  (spreadsheet/set-cell! cell (t/local-time (common/in-result-time-zone t))))

(defmethod spreadsheet/set-cell! OffsetDateTime
  [cell t]
  (spreadsheet/set-cell! cell (t/local-date-time (common/in-result-time-zone t))))

(defmethod spreadsheet/set-cell! ZonedDateTime
  [cell t]
  (spreadsheet/set-cell! cell (t/offset-date-time t)))

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.server.middleware`.
(defmethod spreadsheet/set-cell! Object
  [^Cell cell value]
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
  (let [workbook    (SXSSFWorkbook.)
        cell-styles (cell-style-delays workbook)
        sheet       (spreadsheet/add-sheet! workbook (tru "Query result"))]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [cols]} :data}]
        (spreadsheet/add-row! sheet (map (some-fn :display_name :name) cols)))

      (write-row! [_ row _]
        (binding [*cell-styles* cell-styles]
          (spreadsheet/add-row! sheet row)))

      (finish! [_ _]
        (spreadsheet/save-workbook-into-stream! os workbook)
        (.dispose workbook)
        (.close os)))))
