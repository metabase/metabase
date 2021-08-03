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
           [org.apache.poi.ss.usermodel Cell CellType DataFormat DateUtil Sheet Workbook]
           org.apache.poi.xssf.streaming.SXSSFWorkbook))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Format string generation                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^{:arglists '(^String [style-name])} default-datetime-format-strings
  "Default format strings to use for datetime fields if custom viz settings are not provided."
  {:date     "MMMM D, YYYY"
   :datetime "MMMM D, YYYY, H:MM AM/PM"
   :time     "H:MM AM/PM"})

(def ^:private number-setting-keys
  "If any of these settings are present, we should format the column as a number."
  #{::mb.viz/number-style
    ::mb.viz/currency
    ::mb.viz/currency-style
    ::mb.viz/currency-in-header
    ::mb.viz/decimals
    ::mb.viz/scale
    ::mb.viz/prefix
    ::mb.viz/suffix})

(def ^:private datetime-setting-keys
  "If any of these settings are present, we should format the column as a date and/or time."
  #{::mb.viz/date-style
    ::mb.viz/date-separator
    ::mb.viz/date-abbreviate
    ::mb.viz/time-enabled
    ::mb.viz/time-style})

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
     (when (::mb.viz/prefix format-settings) (str "\"" (::mb.viz/prefix format-settings) "\""))
     styled-string
     (when (::mb.viz/suffix format-settings) (str "\"" (::mb.viz/suffix format-settings) "\"")))))

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
  (let [base-time-format (condp = (::mb.viz/time-enabled format-settings "minutes")
                           "minutes"
                           "H:MM"

                           "seconds"
                           "H:MM:SS"

                           "milliseconds"
                           "H:MM:SS.000"

                           ;; {::mb.viz/time-enabled nil} indicates that time is explicitly disabled, rather than
                           ;; defaulting to "minutes"
                           nil
                           nil)
        time-format      (when base-time-format
                           (condp = (::mb.viz/time-style format-settings "h:mm A")
                             "HH:mm"
                             (str "H" base-time-format)

                             "h:mm A"
                             (str base-time-format " AM/PM")

                             "h A"
                             "H AM/PM"))]
    (if time-format
      (str format-string ", " time-format)
      format-string)))

(defn- datetime-format-string
  [format-settings]
  (->> (::mb.viz/date-style format-settings (default-datetime-format-strings :date))
       (abbreviate-date-names format-settings)
       (replace-date-separators format-settings)
       (add-time-format format-settings)))

(defn- format-settings->format-string
  "Returns a format string for a number or datetime column corresponding to the provided format settings."
  [format-settings]
  (cond
    (some #(contains? datetime-setting-keys %) (keys format-settings))
    (datetime-format-string format-settings)

    (some #(contains? number-setting-keys %) (keys format-settings))
    (number-format-string format-settings)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             XLSX export logic                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod i/stream-options :xlsx
  [_]
  {:content-type              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   :write-keepalive-newlines? false
   :status                    200
   :headers                   {"Content-Disposition" (format "attachment; filename=\"query_result_%s.xlsx\""
                                                             (u.date/format (t/zoned-date-time)))}})

(def ^:dynamic *cell-styles*
  "Holds the CellStyle values used within a spreadsheet so that they can be reused. Excel has a limit
  of 64,000 cell styles in a single workbook, so we only want to call .createCellStyle once per column,
  not once per cell."
  nil)

(defn- filter-extra-currency-keys
  "If a column's semantic type is changed to a currency type, then changed to a non-currency
  type, its settings will still include a `currency` field. So we need to remove currency fields
  from non-currency columns to ensure that format strings are generated correctly."
  [cols col-settings]
  (into {}
        (for [col cols]
          (let [settings-key (if (:id col)
                               {::mb.viz/field-id (:id col)}
                               {::mb.viz/column-name (:name col)})
                settings     (get col-settings settings-key)
                is-currency? (isa? (:semantic_type col) :type/Currency)]
            (if is-currency?
              {settings-key settings}
              {settings-key (dissoc settings ::mb.viz/currency)})))))

(defn- format-string-delay
  [^Workbook workbook ^DataFormat data-format format-string]
  (delay
   (doto (.createCellStyle workbook)
     (.setDataFormat (. data-format getFormat ^String format-string)))))

(defn- column-style-delays
  [^Workbook workbook data-format col-settings]
  (into {} (for [[field settings] col-settings]
             (let [id-or-name    (or (::mb.viz/field-id field) (::mb.viz/column-name field))
                   format-string (format-settings->format-string settings)]
               (when format-string
                 {id-or-name (format-string-delay workbook data-format format-string)})))))

(def ^:private cell-style-delays
  "Creates a map of column name or id -> delay, or keyword representing default -> delay. This is bound to
  `*cell-styles*` by `streaming-results-writer`. Dereffing the delay will create the style and add it to
  the workbook if needed.

  Memoized so that it can be called within write-row! without re-running the logic to convert format settings
  to format strings."
  (memoize
   (fn [^Workbook workbook cols col-settings]
     (let [data-format   (. workbook createDataFormat)
           col-settings' (filter-extra-currency-keys cols col-settings)
           col-styles    (column-style-delays workbook data-format col-settings')]
       (into col-styles
             (for [[name-keyword format-string] (seq default-datetime-format-strings)]
               {name-keyword (format-string-delay workbook data-format format-string)}))))))

(defn- cell-style
  "Get the cell style associated with `style-name` by dereffing the delay in `*cell-styles*`.

  This is based on the equivalent multimethod in Docjure, but adapted to support Metabase viz settings."
  ^org.apache.poi.ss.usermodel.CellStyle [style-name]
  (some-> style-name *cell-styles* deref))

(defmulti ^:private set-cell!
  "Sets a cell to the provided value, with an approrpiate style if necessary."
  (fn [^Cell _cell value _id-or-name] (type value)))

;; Temporal values in Excel are just NUMERIC cells that are stored in a floating-point format and have some cell
;; styles applied that dictate how to format them

(defmethod set-cell! LocalDate
  [^Cell cell ^LocalDate t id-or-name]
  (.setCellValue cell t)
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (or (cell-style id-or-name) (cell-style :date))))

(defmethod set-cell! LocalDateTime
  [^Cell cell ^LocalDateTime t id-or-name]
  (.setCellValue cell t)
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (or (cell-style id-or-name) (cell-style :datetime))))

(defmethod set-cell! LocalTime
  [^Cell cell t id-or-name]
  ;; there's no `.setCellValue` for a `LocalTime` -- but all the built-in impls for `LocalDate` and `LocalDateTime` do
  ;; anyway is convert the date(time) to an Excel datetime floating-point number and then set that.
  ;;
  ;; `DateUtil/convertTime` will convert a *time* string to an Excel number; after that we can set the numeric value
  ;; directly.
  ;;
  ;; See https://poi.apache.org/apidocs/4.1/org/apache/poi/ss/usermodel/DateUtil.html#convertTime-java.lang.String-
  (.setCellValue cell (DateUtil/convertTime (u.date/format "HH:mm:ss" t)))
  (.setCellType cell CellType/NUMERIC)
  (.setCellStyle cell (or (cell-style id-or-name) (cell-style :time))))

(defmethod set-cell! OffsetTime
  [^Cell cell t id-or-name]
  (set-cell! cell (t/local-time (common/in-result-time-zone t)) id-or-name))

(defmethod set-cell! OffsetDateTime
  [^Cell cell t id-or-name]
  (set-cell! cell (t/local-date-time (common/in-result-time-zone t)) id-or-name))

(defmethod set-cell! ZonedDateTime
  [^Cell cell t id-or-name]
  (set-cell! cell (t/offset-date-time t) id-or-name))

(defmethod set-cell! String
  [^Cell cell value _]
  (when (= (.getCellType cell) CellType/FORMULA)
    (.setCellType cell CellType/STRING))
  (.setCellValue cell ^String value))

(defmethod set-cell! Number
  [^Cell cell value id-or-name]
  (when (= (.getCellType cell) CellType/FORMULA)
    (.setCellType cell CellType/NUMERIC))
  (.setCellValue cell (double value))
  (.setCellStyle cell (cell-style id-or-name)))

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

(defmethod set-cell! nil [^Cell cell _ _]
  (let [^String null nil]
    (when (= (.getCellType cell) CellType/FORMULA)
      (.setCellType cell CellType/BLANK))
    (.setCellValue cell null)))

(defn- add-row!
  "Adds a row of values to the spreadsheet. Values with the `scaled` viz setting are scaled prior to being added.

  This is based on the equivalent function in Docjure, but adapted to support Metabase viz settings."
  [^Sheet sheet values cols col-settings]
  (let [row-num (if (= 0 (.getPhysicalNumberOfRows sheet))
                  0
                  (inc (.getLastRowNum sheet)))
        row (.createRow sheet row-num)]
    (doseq [[value col index] (map vector values cols (range (count values)))]
      (let [id-or-name (or (:id col) (:name col))
            settings   (or (get col-settings {::mb.viz/field-id id-or-name})
                           (get col-settings {::mb.viz/column-name id-or-name}))
            scaled-val (if (and value (::mb.viz/scale settings))
                         (* value (::mb.viz/scale settings))
                         value)]
        (set-cell! (.createCell row index) scaled-val id-or-name)))
    row))

(defn- column-titles
  "Generates the column titles that should be used in the export, taking into account viz settings."
  [ordered-cols col-settings]
  (for [col ordered-cols]
    (let [id-or-name       (or (:id col) (:name col))
          col-viz-settings (or (get col-settings {::mb.viz/field-id id-or-name})
                               (get col-settings {::mb.viz/column-name id-or-name}))
          is-currency?     (isa? (:semantic_type col) :type/Currency)
          column-title     (or (::mb.viz/column-title col-viz-settings)
                               (:display_name col)
                               (:name col))]
      (if (and is-currency? (::mb.viz/currency-in-header col-viz-settings true))
        (str column-title " (" (currency-identifier col-viz-settings) ")")
        column-title))))

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
              cell-styles  (cell-style-delays workbook ordered-cols col-settings)]
          (binding [*cell-styles* cell-styles]
            (add-row! sheet ordered-row ordered-cols col-settings))))

      (finish! [_ _]
        (spreadsheet/save-workbook-into-stream! os workbook)
        (.dispose workbook)
        (.close os)))))
