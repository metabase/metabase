(ns metabase.query-processor.streaming.xlsx
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [java-time :as t]
   [metabase.mbql.schema :as mbql.s]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.shared.util.currency :as currency]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.io OutputStream)
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (org.apache.poi.ss.usermodel Cell DataFormat DateUtil Workbook)
   (org.apache.poi.ss.util CellRangeAddress)
   (org.apache.poi.xssf.streaming SXSSFRow SXSSFSheet SXSSFWorkbook)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Format string generation                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private number-setting-keys
  "If any of these settings are present, we should format the column as a number."
  #{::mb.viz/number-style
    ::mb.viz/number-separators
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

(defn- merge-global-settings
  "Merge format settings defined in the localization preferences into the format settings
  for a single column."
  [format-settings global-settings-key]
  (let [global-settings (global-settings-key (public-settings/custom-formatting))
        normalized      (mb.viz/db->norm-column-settings-entries global-settings)]
    (merge normalized format-settings)))

(defn- currency-identifier
  "Given the format settings for a currency column, returns the symbol, code or name for the
  appropriate currency."
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

(defn- default-number-format?
  "Use default formatting for decimal number types that have no other format settings defined
  aside from prefix, suffix or scale."
  [format-settings]
  (and
   ;; This is a decimal number (not a currency, percentage or scientific notation)
   (or (= (::mb.viz/number-style format-settings) "decimal")
       (not (::mb.viz/number-style format-settings)))
   ;; Custom number formatting options are not set
   (not (seq (dissoc format-settings
                     ::mb.viz/number-style
                     ::mb.viz/number-separators
                     ::mb.viz/scale
                     ::mb.viz/prefix
                     ::mb.viz/suffix)))))

(defn- number-format-strings
  "Returns format strings for a number column corresponding to the given settings.
  The first value in the returned list should be used for integers, or numbers that round to integers.
  The second number should be used for all other values."
  [format-settings semantic-type]
  (let [format-strings
        (let [decimals        (::mb.viz/decimals format-settings 2)
              is-currency?    (or (isa? semantic-type :type/Currency)
                                  (= (::mb.viz/number-style format-settings) "currency"))
              merged-settings (if is-currency?
                                (merge-global-settings format-settings :type/Currency)
                                format-settings)
              base-string     (if (= (::mb.viz/number-separators format-settings) ".")
                                ;; Omit thousands separator if ommitted in the format settings. Otherwise ignore
                                ;; number separator settings, since custom separators are not supported in XLSX.
                                "###0"
                                "#,##0")
              base-strings    (if (default-number-format? merged-settings)
                                ;; [int-format, float-format]
                                [base-string (str base-string ".##")]
                                (repeat 2 (apply str base-string (when (> decimals 0) (apply str "." (repeat decimals "0"))))))]
          (condp = (::mb.viz/number-style merged-settings)
            "percent"
            (map #(str % "%") base-strings)

            "scientific"
            (map #(str % "E+0") base-strings)

            "decimal"
            base-strings

            (if (and is-currency? (false? (::mb.viz/currency-in-header merged-settings)))
              (map #(currency-format-string % merged-settings) base-strings)
              base-strings)))]
    (map
     (fn [format-string]
      (str
        (when (::mb.viz/prefix format-settings) (str "\"" (::mb.viz/prefix format-settings) "\""))
        format-string
        (when (::mb.viz/suffix format-settings) (str "\"" (::mb.viz/suffix format-settings) "\""))))
     format-strings)))

(defn- abbreviate-date-names
  [format-settings format-string]
  (if (::mb.viz/date-abbreviate format-settings false)
    (-> format-string
        (str/replace "mmmm" "mmm")
        (str/replace "dddd" "ddd"))
    format-string))

(defn- replace-date-separators
  [format-settings format-string]
  (let [separator (::mb.viz/date-separator format-settings "/")]
    (str/replace format-string "/" separator)))

(defn- time-format
  [format-settings]
  (let [base-time-format (condp = (::mb.viz/time-enabled format-settings "minutes")
                               "minutes"
                               "h:mm"

                               "seconds"
                               "h:mm:ss"

                               "milliseconds"
                               "h:mm:ss.000"

                               ;; {::mb.viz/time-enabled nil} indicates that time is explicitly disabled, rather than
                               ;; defaulting to "minutes"
                               nil
                               nil)]
    (when base-time-format
      (condp = (::mb.viz/time-style format-settings "h:mm A")
        "HH:mm"
        (str "h" base-time-format)

        ;; Deprecated time style which should be already converted to HH:mm when viz settings are
        ;; normalized, but we'll handle it here too just in case. (#18112)
        "k:mm"
        (str "h" base-time-format)

        "h:mm A"
        (str base-time-format " am/pm")

        "h A"
        "h am/pm"))))

(defn- add-time-format
  "Adds the appropriate time setting to a date format string if necessary, producing a datetime format string."
  [format-settings unit format-string]
  (if (or (not unit) (mbql.s/time-bucketing-units unit))
    (if-let [time-format (time-format format-settings)]
      (str format-string ", " time-format)
      format-string)
    format-string))

(defn- month-style
  "For a given date format, returns the format to use in exports if :unit is :month"
  [date-format]
  (case date-format
    "m/d/yyyy" "m/yyyy"
    "yyyy/m/d" "yyyy/m"
    ;; Default for all other styles
    "mmmm, yyyy"))

(defn- date-format
  [format-settings unit]
  (let [base-style (u/lower-case-en (::mb.viz/date-style format-settings "mmmm d, yyyy"))
        unit-style (case unit
                     :month (month-style base-style)
                     :year "yyyy"
                     base-style)]
    (->> unit-style
         (abbreviate-date-names format-settings)
         (replace-date-separators format-settings))))

(defn- datetime-format-string
  ([format-settings]
   (datetime-format-string format-settings nil))

  ([format-settings unit]
   (let [merged-settings (merge-global-settings format-settings :type/Temporal)]
     (->> (date-format merged-settings unit)
          (add-time-format merged-settings unit)))))

(defn- format-settings->format-strings
  "Returns a vector of format strings for a datetime column or number column, corresponding
  to the provided format settings."
  [format-settings {semantic-type :semantic_type, effective-type :effective_type, unit :unit}]
  (u/one-or-many
   (cond
     ;; Primary key or foreign key
     (isa? semantic-type :Relation/*)
     "0"

     (and (or (some #(contains? datetime-setting-keys %) (keys format-settings))
              (isa? semantic-type :type/Temporal))
          (isa? effective-type :type/Temporal))
     (datetime-format-string format-settings unit)

     (or (some #(contains? number-setting-keys %) (keys format-settings))
         (isa? semantic-type :type/Currency))
     (number-format-strings format-settings semantic-type))))

(defn- default-format-strings
  "Default strings to use for datetime and number fields if custom format settings are not set."
  []
  {:datetime (datetime-format-string (merge-global-settings {} :type/Temporal))
   :date     (datetime-format-string (merge-global-settings {::mb.viz/time-enabled nil} :type/Temporal))
   ;; Use a fixed format for time fields since time formatting isn't currently supported (#17357)
   :time     "h:mm am/pm"
   :integer  "#,##0"
   :float    "#,##0.##"})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             XLSX export logic                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod qp.si/stream-options :xlsx
  ([_]
   (qp.si/stream-options :xlsx "query_result"))
  ([_ filename-prefix]
   {:content-type              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    :write-keepalive-newlines? false
    :status                    200
    :headers                   {"Content-Disposition" (format "attachment; filename=\"%s_%s.xlsx\""
                                                              (or filename-prefix "query_result")
                                                              (u.date/format (t/zoned-date-time)))}}))

(def ^:dynamic *cell-styles*
  "Holds the CellStyle values used within a spreadsheet so that they can be reused. Excel has a limit
  of 64,000 cell styles in a single workbook, so we only want to call .createCellStyle once per column,
  not once per cell."
  nil)

(defn- format-string-delay
  [^Workbook workbook ^DataFormat data-format format-string]
  (delay
   (doto (.createCellStyle workbook)
     (.setDataFormat (. data-format getFormat ^String format-string)))))

(defn- column-style-delays
  [^Workbook workbook data-format col-settings cols]
  (into {} (for [col cols]
             (let [settings-key  (if (:id col)
                                   {::mb.viz/field-id (:id col)}
                                   {::mb.viz/column-name (:name col)})
                   id-or-name    (first (vals settings-key))
                   settings      (get col-settings settings-key)
                   format-strings (format-settings->format-strings settings col)]
               (when (seq format-strings)
                 {id-or-name
                  (map
                   #(format-string-delay workbook data-format %)
                   format-strings)})))))

(def ^:private cell-style-delays
  "Creates a map of column name or id -> delay, or keyword representing default -> delay. This is bound to
  `*cell-styles*` by `streaming-results-writer`. Dereffing the delay will create the style and add it to
  the workbook if needed.

  Memoized so that it can be called within write-row! without re-running the logic to convert format settings
  to format strings."
  (memoize
   (fn [^Workbook workbook cols col-settings]
     (let [data-format (. workbook createDataFormat)
           col-styles  (column-style-delays workbook data-format col-settings cols)]
       (into col-styles
             (for [[name-keyword format-string] (seq (default-format-strings))]
               {name-keyword (format-string-delay workbook data-format format-string)}))))))

(defn- cell-style
  "Get the cell style(s) associated with `id-or-name` by dereffing the delay(s) in `*cell-styles*`."
  [^org.apache.poi.ss.usermodel.CellStyle id-or-name]
  (let [cell-style-delays (some->> id-or-name *cell-styles* u/one-or-many (map deref))]
    (if (= (count cell-style-delays) 1)
      (first cell-style-delays)
      cell-style-delays)))

(defn- rounds-to-int?
  "Returns whether a number should be formatted as an integer after being rounded to 2 decimal places."
  [value]
  (let [rounded (.setScale (bigdec value) 2 java.math.RoundingMode/HALF_UP)]
    (== (bigint rounded) rounded)))

(defmulti ^:private set-cell!
  "Sets a cell to the provided value, with an approrpiate style if necessary.

  This is based on the equivalent multimethod in Docjure, but adapted to support Metabase viz settings."
  (fn [^Cell _cell value _id-or-name] (type value)))

;; Temporal values in Excel are just NUMERIC cells that are stored in a floating-point format and have some cell
;; styles applied that dictate how to format them

(defmethod set-cell! LocalDate
  [^Cell cell ^LocalDate t id-or-name]
  (.setCellValue cell t)
  (.setCellStyle cell (or (cell-style id-or-name) (cell-style :date))))

(defmethod set-cell! LocalDateTime
  [^Cell cell ^LocalDateTime t id-or-name]
  (.setCellValue cell t)
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
  (.setCellValue cell ^String value))

(defmethod set-cell! Number
  [^Cell cell value id-or-name]
  (let [v (double value)]
    (.setCellValue cell v)
    (when (u/real-number? v)
      (let [styles (u/one-or-many (cell-style id-or-name))]
        (if (rounds-to-int? v)
          (.setCellStyle cell (or (first styles) (cell-style :integer)))
          (.setCellStyle cell (or (second styles) (cell-style :float))))))))

(defmethod set-cell! Boolean
  [^Cell cell value _]
  (.setCellValue cell ^Boolean value))

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.server.middleware`.
(defmethod set-cell! Object
  [^Cell cell value _]
  ;; stick the object in a JSON map and encode it, which will force conversion to a string. Then unparse that JSON and
  ;; use the resulting value as the cell's new String value.  There might be some more efficient way of doing this but
  ;; I'm not sure what it is.
  (.setCellValue cell (str (-> (json/generate-string {:v value})
                               (json/parse-string keyword)
                               :v))))

(defmethod set-cell! nil [^Cell cell _ _]
  (.setBlank cell))

(def ^:dynamic *parse-temporal-string-values*
  "When true, XLSX exports will attempt to parse string values into corresponding java.time classes so that
  formatting can be applied. This should be enabled for generation of pulse/dashboard subscription attachments."
  false)

(defn- add-row!
  "Adds a row of values to the spreadsheet. Values with the `scaled` viz setting are scaled prior to being added.

  This is based on the equivalent function in Docjure, but adapted to support Metabase viz settings."
  [^SXSSFSheet sheet values cols col-settings]
  (let [row-num (if (= 0 (.getPhysicalNumberOfRows sheet))
                  0
                  (inc (.getLastRowNum sheet)))
        row (.createRow sheet row-num)]
    (doseq [[value col index] (map vector values cols (range (count values)))]
      (let [id-or-name   (or (:id col) (:name col))
            settings     (or (get col-settings {::mb.viz/field-id id-or-name})
                             (get col-settings {::mb.viz/column-name id-or-name}))
            scaled-val   (if (and value (::mb.viz/scale settings))
                           (* value (::mb.viz/scale settings))
                           value)
            ;; Temporal values are converted into strings in the format-rows QP middleware, which is enabled during
            ;; dashboard subscription/pulse generation. If so, we should parse them here so that formatting is applied.
            parsed-value (if (and *parse-temporal-string-values* (string? value))
                           (try (u.date/parse value)
                                ;; Fallback to plain string value if it couldn't be parsed
                                (catch Exception _ value))
                           scaled-val)]
        (set-cell! (.createCell ^SXSSFRow row ^Integer index) parsed-value id-or-name)))
    row))

(defn- column-titles
  "Generates the column titles that should be used in the export, taking into account viz settings."
  [ordered-cols col-settings]
  (for [col ordered-cols]
    (let [id-or-name       (or (and (:remapped_from col) (:fk_field_id col))
                               (:id col)
                               (:name col))
          format-settings  (or (get col-settings {::mb.viz/field-id id-or-name})
                               (get col-settings {::mb.viz/column-name id-or-name}))
          is-currency?     (or (isa? (:semantic_type col) :type/Currency)
                               (= (::mb.viz/number-style format-settings) "currency"))
          merged-settings  (if is-currency?
                             (merge-global-settings format-settings :type/Currency)
                             format-settings)
          column-title     (or (::mb.viz/column-title merged-settings)
                               (:display_name col)
                               (:name col))]
      (if (and is-currency? (::mb.viz/currency-in-header merged-settings true))
        (str column-title " (" (currency-identifier merged-settings) ")")
        column-title))))

(def ^:dynamic *auto-sizing-threshold*
  "The maximum number of rows we should use for auto-sizing. If this number is too large, exports
  of large datasets will be prohibitively slow."
  100)

(def ^:private extra-column-width
  "The extra width applied to columns after they have been auto-sized, in units of 1/256 of a character width.
  This ensures the cells in the header row have enough room for the filter dropdown icon."
  (* 4 256))

(def ^:private max-column-width
  "Cap column widths at 255 characters"
  (* 255 256))

(defn- autosize-columns!
  "Adjusts each column to fit its largest value, plus a constant amount of extra padding."
  [sheet]
  (doseq [i (.getTrackedColumnsForAutoSizing ^SXSSFSheet sheet)]
    (.autoSizeColumn ^SXSSFSheet sheet i)
    (.setColumnWidth ^SXSSFSheet sheet i (min max-column-width
                                              (+ (.getColumnWidth ^SXSSFSheet sheet i) extra-column-width)))
    (.untrackColumnForAutoSizing ^SXSSFSheet sheet i)))

(defn- setup-header-row!
  "Turns on auto-filter for the header row, which adds a button to each header cell that allows columns to be
  filtered and sorted. Also freezes the header row so that it floats above the data."
  [sheet col-count]
  (when (> col-count 0)
    (.setAutoFilter ^SXSSFSheet sheet (new CellRangeAddress 0 0 0 (dec col-count)))
    (.createFreezePane ^SXSSFSheet sheet 0 1)))

(defmethod qp.si/streaming-results-writer :xlsx
  [_ ^OutputStream os]
  (let [workbook            (SXSSFWorkbook.)
        sheet               (spreadsheet/add-sheet! workbook (tru "Query result"))]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols]} :data} {col-settings ::mb.viz/column-settings}]
        (doseq [i (range (count ordered-cols))]
          (.trackColumnForAutoSizing ^SXSSFSheet sheet i))
        (setup-header-row! sheet (count ordered-cols))
        (spreadsheet/add-row! sheet (column-titles ordered-cols col-settings)))

      (write-row! [_ row row-num ordered-cols {:keys [output-order] :as viz-settings}]
        (let [ordered-row  (if output-order
                             (let [row-v (into [] row)]
                               (for [i output-order] (row-v i)))
                             row)
              col-settings (::mb.viz/column-settings viz-settings)
              cell-styles  (cell-style-delays workbook ordered-cols col-settings)]
          (binding [*cell-styles* cell-styles]
            (add-row! sheet ordered-row ordered-cols col-settings))
          (when (= (inc row-num) *auto-sizing-threshold*)
            (autosize-columns! sheet))))

      (finish! [_ {:keys [row_count]}]
        (when (or (nil? row_count) (< row_count *auto-sizing-threshold*))
          ;; Auto-size columns if we never hit the row threshold, or a final row count was not provided
          (autosize-columns! sheet))
        (try
          (spreadsheet/save-workbook-into-stream! os workbook)
          (finally
            (.dispose workbook)
            (.close os)))))))
