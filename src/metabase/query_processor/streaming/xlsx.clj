(ns metabase.query-processor.streaming.xlsx
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [java-time :as t]
            [metabase.query-processor.streaming.common :as common]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.shared.util.currency :as currency]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [tru]])
  (:import java.io.OutputStream
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [org.apache.poi.ss.usermodel Cell CellType DateUtil Sheet Workbook]
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

;; TODO update comment
;; Since we can only have a limited number of styles we'll enumerate the possible styles we'll want to use. Then we'll
;; create a bunch of delays for them that will create them if needed and bind this to `*cell-styles*`; we'll use them
;; as needed in various `set-cell!` method impls.

(def ^:private ^{:arglists '(^String [style-name])} default-format-strings
  "Predefined cell format strings. These are used to get the corresponding predefined cell format number using
  `BuiltinFormats/getBuiltinFormat`. See `(BuiltinFormats/getAll)` for all predefined formats"
  {:date     "MMMM D, YYYY"
   :datetime "MMMM D, YYYY, H:MM AM/PM"
   :time     "H:MM AM/PM"})

(defn- currency-identifier
  "Given the format settings for a currency column, returns the symbol, code or name for the
  approrpiate currency."
  [format-settings]
  (let [currency-code (::mb.viz/currency format-settings "USD")]
    (condp = (::mb.viz/currency-style format-settings "symbol")
      "symbol"
      (if (currency/supports-symbol? currency-code)
        (get-in currency/currency [(keyword currency-code) :symbol])
        ;; Fall back to using code if symbol isn't not supported on the Metabase frontend
        currency-code)

      "code"
      currency-code

      "name"
      (get-in currency/currency [(keyword currency-code) :name_plural]))))

(defn- currency-format-string
  "Adds a currency to the base format string as either a suffix (for pluralized names) or
  prefix (for symbols or codes)."
  [base-string format-settings]
  (let [currency-code (::mb.viz/currency format-settings "USD")
        currency-identifier (currency-identifier format-settings)]
    (condp = (::mb.viz/currency-style format-settings "symbol")
      "symbol"
      (if (currency/supports-symbol? currency-code)
        (str "[$" currency-identifier "]" base-string)
        (str "[$" currency-identifier "] " base-string))

      "code"
      (str "[$" currency-identifier "] " base-string)

      "name"
      (str base-string "\" " currency-identifier "\""))))

(def ^:private number-viz-settings
  "If any of these settings are present, we should format the column as a number."
  #{::mb.viz/number-style
    ::mb.viz/currency
    ::mb.viz/currency-style
    ::mb.viz/currency-in-header
    ::mb.viz/decimals
    ::mb.viz/scale
    ::mb.viz/prefix
    ::mb.viz/suffix})

(def ^:private datetime-viz-settings
  "If any of these settings are present, we should format the column as a date and/or time."
  #{::mb.viz/date-style
    ::mb.viz/date-separator
    ::mb.viz/date-abbreviate
    ::mb.viz/time-enabled
    ::mb.viz/time-style})

(defn- general-number-format?
  "Use General for decimal number types that have no other format settings defined
  aside from prefix, suffix or scale."
  [format-settings]
  (and
   ;; This is a decimal number (not a currency, percentage or scientific notation)
   (or (= (::mb.viz/number-style format-settings) "decimal")
       (not (::mb.viz/number-style format-settings)))
   ;; Custom number formatting options are not set
   (not (seq (dissoc format-settings
                     ::mb.viz/number-style
                     ::mb.viz/scale
                     ::mb.viz/prefix
                     ::mb.viz/suffix)))))

(defn- number-format-string
  "Returns a format string for a number column corresponding to the given settings."
  [format-settings]
  (let [styled-string
        (let [decimals (::mb.viz/decimals format-settings 2)
              base-string (if (general-number-format? format-settings)
                            "General"
                            (apply str "#,##0" (when (> decimals 0) (apply str "." (repeat decimals "0")))))]
          (condp = (::mb.viz/number-style format-settings)
            "percent"
            (str base-string "%")

            "scientific"
            (str base-string "E+0")

            "decimal"
            base-string

            (if (false? (::mb.viz/currency-in-header format-settings))
              ;; Always format values as currency if currency-in-header is included as false.
              ;; Don't check number-style, since it may not be included if the column's semantic
              ;; type is "currency".
              (currency-format-string base-string format-settings)
              base-string)))]
    (str
     (str "\"" (::mb.viz/prefix format-settings) "\"")
     styled-string
     (str "\"" (::mb.viz/suffix format-settings) "\""))))

(defn- abbreviate-date-names
  [format-settings format-string]
  (if (::mb.viz/date-abbreviate format-settings false)
    (-> format-string
     (str/replace "MMMM" "MMM")
     (str/replace "dddd" "ddd"))
    format-string))

(defn- replace-date-separators
  [format-settings format-string]
  (let [separator (::mb.viz/date-separator format-settings "/")]
    (str/replace format-string "/" separator)))

(defn- add-time-format
  [format-settings format-string]
  (let [base-time-format (condp = (::mb.viz/time-enabled format-settings)
                           "minutes"
                           "H:MM"

                           "seconds"
                           "H:MM:SS"

                           "milliseconds"
                           "H:MM:SS.000"

                           nil
                           nil

                           ;; Default: minutes
                           "H:MM")
        time-format      (when base-time-format
                           (condp = (::mb.viz/time-style format-settings)
                             "HH:mm"
                             (str "H" base-time-format)

                             "h:mm A"
                             (str base-time-format " AM/PM")

                             ;; Default: AM/PM
                             (str base-time-format " AM/PM")))]
    (if time-format
      (str format-string ", " time-format)
      format-string)))

(defn- datetime-format-string
  [format-settings]
  (->> (::mb.viz/date-style format-settings (default-format-strings :date))
       (abbreviate-date-names format-settings)
       (replace-date-separators format-settings)
       (add-time-format format-settings)))

(defn- format-settings->format-string
  "Returns a format string corresponding to the given settings."
  [format-settings]
  (cond
    (some #(contains? number-viz-settings %) (keys format-settings))
    (number-format-string format-settings)

    (some #(contains? datetime-viz-settings %) (keys format-settings))
    (datetime-format-string format-settings)))

(defn- format-string-delay
  [^Workbook workbook data-format format-string]
  (delay
   (doto (.createCellStyle workbook)
     (.setDataFormat (. data-format getFormat format-string)))))

(defn- column-style-delays
  [^Workbook workbook data-format column-settings]
  (into {} (for [[field settings] column-settings]
             (let [name-or-id    (or (::mb.viz/field-id field) (::mb.viz/column-name field))
                   format-string (format-settings->format-string settings)]
               (when format-string
                 {name-or-id (format-string-delay workbook data-format format-string)})))))

(def ^:private cell-style-delays
  "Creates a map of column name or id -> delay, or keyword representing default -> delay. This is bound to
  `*cell-styles*` by `streaming-results-writer`. Dereffing the delay will create the style and add it to
  the workbook if needed."
  (memoize
   (fn [^Workbook workbook column-settings]
     (let [data-format (. workbook createDataFormat)
           column-styles (column-style-delays workbook data-format column-settings)]
       (into column-styles
             (for [[name-keyword format-string] (seq default-format-strings)]
               {name-keyword (format-string-delay workbook data-format format-string)}))))))

(defn- cell-style
  "Get the cell style associated with `style-name` by dereffing the delay in `*cell-styles*`."
  ^org.apache.poi.ss.usermodel.CellStyle [style-name]
  (some-> style-name *cell-styles* deref))

(defmulti set-cell! (fn [^Cell _cell value _name-or-id] (type value)))

;; Temporal values in Excel are just NUMERIC cells that are stored in a floating-point format and have some cell
;; styles applied that dictate how to format them

(defmethod set-cell! LocalDate
  [^Cell cell ^LocalDate t name-or-id]
  (.setCellValue cell t)
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (or (cell-style name-or-id) (cell-style :date))))

(defmethod set-cell! LocalDateTime
  [^Cell cell ^LocalDateTime t name-or-id]
  (.setCellValue cell t)
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (or (cell-style name-or-id) (cell-style :datetime))))

(defmethod set-cell! LocalTime
  [^Cell cell t name-or-id]
  ;; there's no `.setCellValue` for a `LocalTime` -- but all the built-in impls for `LocalDate` and `LocalDateTime` do
  ;; anyway is convert the date(time) to an Excel datetime floating-point number and then set that.
  ;;
  ;; `DateUtil/convertTime` will convert a *time* string to an Excel number; after that we can set the numeric value
  ;; directly.
  ;;
  ;; See https://poi.apache.org/apidocs/4.1/org/apache/poi/ss/usermodel/DateUtil.html#convertTime-java.lang.String-
  (.setCellValue cell (DateUtil/convertTime (u.date/format "HH:mm:ss" t)))
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (or (cell-style name-or-id) (cell-style :time))))

(defmethod set-cell! OffsetTime
  [^Cell cell t name-or-id]
  (set-cell! cell (t/local-time (common/in-result-time-zone t)) name-or-id))

(defmethod set-cell! OffsetDateTime
  [^Cell cell t name-or-id]
  (set-cell! cell (t/local-date-time (common/in-result-time-zone t)) name-or-id))

(defmethod set-cell! ZonedDateTime
  [^Cell cell t name-or-id]
  (set-cell! cell (t/offset-date-time t) name-or-id))

(defmethod set-cell! String
  [^Cell cell value _]
  (when (= (.getCellType cell) CellType/FORMULA)
    (.setCellType cell CellType/STRING))
  (.setCellValue cell ^String value))

(defmethod set-cell! Number
  [^Cell cell value name-or-id]
  (when (= (.getCellType cell) CellType/FORMULA)
    (.setCellType cell CellType/NUMERIC))
  (.setCellValue cell (double value))
  (.setCellStyle cell (cell-style name-or-id)))

(defmethod set-cell! Boolean
  [^Cell cell value _]
  (when (= (.getCellType cell) CellType/FORMULA)
    (.setCellType cell CellType/BOOLEAN))
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
    (when (= (.getCellType cell) CellType/FORMULA)
      (.setCellType cell CellType/BLANK))
    (.setCellValue cell null)))

(defn add-row! [^Sheet sheet values cols col-settings]
  (let [row-num (if (= 0 (.getPhysicalNumberOfRows sheet))
                  0
                  (inc (.getLastRowNum sheet)))
        row (.createRow sheet row-num)]
    (doseq [[value col index] (map vector values cols (range (count values)))]
      (let [name-or-id (or (:id col) (:name col))
            settings   (or (get col-settings {::mb.viz/field-id name-or-id})
                           (get col-settings {::mb.viz/column-name name-or-id}))
            scaled-val (if (and value (::mb.viz/scale settings))
                         (* value (::mb.viz/scale settings))
                         value)]
        (set-cell! (.createCell row index) scaled-val name-or-id)))
    row))

;; TODO include currency in header
(defn- column-titles
  [ordered-cols col-settings]
  (for [col ordered-cols]
    (let [name-or-id       (or (:id col) (:name col))
          col-viz-settings (or (get col-settings {::mb.viz/field-id name-or-id})
                               (get col-settings {::mb.viz/column-name name-or-id}))
          _is-currency?     (isa? (:semantic_type col) :type/Currency)
          column-title     (or (::mb.viz/column-title col-viz-settings)
                               (:display_name col)
                               (:name col))]
      column-title)))

(defmethod i/streaming-results-writer :xlsx
  [_ ^OutputStream os]
  (let [workbook            (SXSSFWorkbook.)
        sheet               (spreadsheet/add-sheet! workbook (tru "Query result"))]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols]} :data} {col-settings ::mb.viz/column-settings}]
        (spreadsheet/add-row! sheet (column-titles ordered-cols col-settings)))

      (write-row! [_ row _ ordered-cols {:keys [output-order] :as viz-settings}]
        (let [ordered-row  (if output-order
                             (let [row-v (into [] row)]
                               (for [i output-order] (row-v i)))
                             row)
              col-settings (::mb.viz/column-settings viz-settings)
              cell-styles  (cell-style-delays workbook col-settings)]
          (binding [*cell-styles* cell-styles]
            (add-row! sheet ordered-row ordered-cols col-settings))))

      (finish! [_ _]
        (spreadsheet/save-workbook-into-stream! os workbook)
        (.dispose workbook)
        (.close os)))))
