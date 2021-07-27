(ns metabase.query-processor.streaming.xlsx
  (:require [cheshire.core :as json]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [java-time :as t]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.streaming.common :as common]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [tru]])
  (:import java.io.OutputStream
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [org.apache.poi.ss.usermodel BuiltinFormats Cell CellType DateUtil Sheet Workbook]
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

(defn- format-string
  [format-settings]
  (when (= (::mb.viz/number-style format-settings) "percent") "0%"))

(def ^:private column-style-delays
  "Creates a map of column name or ids -> delay. This is bound to `*cell-styles*` by `streaming-results-writer`.
  Dereffing the delay will create the style and add it to the workbook if needed."
  (memoize
   (fn [^Workbook workbook column-settings]
     (into {}
           (for [[field settings] column-settings]
             (let [id-or-name (or (::mb.viz/field-id field) (::mb.viz/column-name field))
                   fmt-str (format-string settings)]
               (when fmt-str
                 (let [data-format (. workbook createDataFormat)]
                   {id-or-name (delay
                                (doto (.createCellStyle workbook)
                                  (.setDataFormat (. data-format getFormat fmt-str))))}))))))))

(defn- cell-style
  "Get the cell style associated with `style-name` by dereffing the delay in `*cell-styles*`."
  ^org.apache.poi.ss.usermodel.CellStyle [style-name]
  (some-> style-name *cell-styles* deref))

(defmulti set-cell! (fn [^Cell _cell value _column] (type value)))

;; Temporal values in Excel are just NUMERIC cells that are stored in a floating-point format and have some cell
;; styles applied that dictate how to format them

(defmethod set-cell! LocalDate
  [^Cell cell ^LocalDate t _]
  (.setCellValue cell t)
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (cell-style :date)))

(defmethod set-cell! LocalDateTime
  [^Cell cell ^LocalDateTime t _]
  (.setCellValue cell t)
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (cell-style :datetime)))

(defmethod set-cell! LocalTime
  [^Cell cell t _]
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

(defmethod set-cell! OffsetTime
  [cell t _]
  (set-cell! cell (t/local-time (common/in-result-time-zone t))))

(defmethod set-cell! OffsetDateTime
  [cell t _]
  (set-cell! cell (t/local-date-time (common/in-result-time-zone t))))

(defmethod set-cell! ZonedDateTime
  [cell t _]
  (set-cell! cell (t/offset-date-time t)))

(defmethod set-cell! String [^Cell cell value _]
  (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/STRING))
  (.setCellValue cell ^String value))

(defmethod set-cell! Number [^Cell cell value column]
  (let [name-or-id (or (:id column) (:name column))]
    (def my-name-or-id name-or-id)
    (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/NUMERIC))
    (.setCellValue cell (double value))
    (.setCellStyle cell (cell-style name-or-id))))

(defmethod set-cell! Boolean [^Cell cell value _]
  (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/BOOLEAN))
  (.setCellValue cell ^Boolean value))

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.server.middleware`.
(defmethod set-cell! Object
  [^Cell cell value _]
  (when (= (.getCellType cell) CellType/FORMULA)
    (.setCellType cell CellType/STRING))
  ;; stick the object in a JSON map and encode it, which will force conversion to a string. Then unparse that JSON and
  ;; use the resulting value as the cell's new String value.  There might be some more efficient way of doing this but
  ;; I'm not sure what it is.
  (.setCellValue cell (str (-> (json/generate-string {:v value})
                               (json/parse-string keyword)
                               :v))))

(defmethod set-cell! nil [^Cell cell _value _col]
  (let [^String null nil]
    (when (= (.getCellType cell) CellType/FORMULA) (.setCellType cell CellType/BLANK))
    (.setCellValue cell null)))

(defn add-row! [^Sheet sheet values cols]
  (let [row-num (if (= 0 (.getPhysicalNumberOfRows sheet))
                  0
                  (inc (.getLastRowNum sheet)))
        row (.createRow sheet row-num)]
    ;; TODO rewrite
    (doseq [[column-index value] (map-indexed #(list %1 %2) values)]
      (set-cell! (.createCell row column-index) value (nth cols column-index)))
    row))

(defmethod i/streaming-results-writer :xlsx
  [_ ^OutputStream os]
  (let [workbook    (SXSSFWorkbook.)
        cell-styles (cell-style-delays workbook)
        sheet       (spreadsheet/add-sheet! workbook (tru "Query result"))]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols]} :data} viz-settings]
        (spreadsheet/add-row! sheet (map (some-fn :display_name :name) ordered-cols)))

      (write-row! [_ row _ ordered-cols {:keys [output-order] :as viz-settings}]
        (let [ordered-row (if output-order
                            (let [row-v (into [] row)]
                              (for [i output-order] (row-v i)))
                            row)
              col-settings (::mb.viz/column-settings viz-settings)
              col-styles (column-style-delays workbook col-settings)]
          (def my-col-settings col-settings)
          (binding [*cell-styles* (merge cell-styles col-styles)]
            (add-row! sheet ordered-row ordered-cols))))

      (finish! [_ _]
        (spreadsheet/save-workbook-into-stream! os workbook)
        (.dispose workbook)
        (.close os)))))
