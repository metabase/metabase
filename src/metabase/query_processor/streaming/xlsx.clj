(ns metabase.query-processor.streaming.xlsx
  (:refer-clojure :exclude [mapv some])
  (:require
   [clojure.string :as str]
   [dk.ative.docjure.spreadsheet :as spreadsheet] ; codespell:ignore ative
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.formatter.core :as formatter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.pivot.core :as pivot]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.settings :as qp.settings]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util :as u]
   [metabase.util.currency :as currency]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.performance :refer [mapv some]])
  (:import
   (java.io OutputStream)
   (java.time
    LocalDate
    LocalDateTime
    LocalTime
    OffsetDateTime
    OffsetTime
    ZonedDateTime)
   (java.util UUID)
   (org.apache.poi.ss.usermodel
    Cell
    DataConsolidateFunction
    DataFormat
    DateUtil
    Workbook)
   (org.apache.poi.ss.util CellRangeAddress)
   (org.apache.poi.xssf.streaming SXSSFRow SXSSFSheet SXSSFWorkbook)
   (org.apache.poi.xssf.usermodel XSSFRow XSSFSheet)))

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

(defn- currency-format-string
  "Adds a currency to the base format string as either a suffix (for pluralized names) or
  prefix (for symbols or codes)."
  [base-string format-settings]
  (let [currency-code (::mb.viz/currency format-settings "USD")
        currency-identifier (streaming.common/currency-identifier format-settings)]
    (condp = (::mb.viz/currency-style format-settings "symbol")
      "symbol"
      (if (currency/supports-symbol? currency-code)
        (str "[$" currency-identifier "]" base-string)
        (str "[$" currency-identifier "] " base-string))

      "code"
      (str "[$" currency-identifier "] " base-string)

      "name"
      (str base-string "\" " currency-identifier "\""))))

(defn- unformatted-number?
  "Use default formatting for decimal number types that have no other format settings defined
  aside from prefix, suffix or scale."
  [format-settings]
  (and
   ;; This is a decimal or currency number (not a percentage or scientific notation)
   (or (= (::mb.viz/number-style format-settings) "decimal")
       (= (::mb.viz/number-style format-settings) "currency")
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
  [{::mb.viz/keys [prefix suffix number-style number-separators currency-in-header decimals] :as format-settings}]
  (let [format-strings
        (let [base-string     (if (= number-separators ".")
                                ;; Omit thousands separator if omitted in the format settings. Otherwise ignore
                                ;; number separator settings, since custom separators are not supported in XLSX.
                                "###0"
                                "#,##0")
              decimals        (or decimals 2)
              base-strings    (if (unformatted-number? format-settings)
                                ;; [int-format, float-format]
                                [base-string (str base-string ".##")]
                                (repeat 2 (apply str base-string (when (> decimals 0) (apply str "." (repeat decimals "0"))))))]
          (condp = number-style
            "percent"
            (map #(str % "%") base-strings)

            "scientific"
            (map #(str % "E+0") base-strings)

            "decimal"
            base-strings

            (if (and (= number-style "currency")
                     (false? currency-in-header))
              (map #(currency-format-string % format-settings) base-strings)
              base-strings)))]
    (map
     (fn [format-string]
       (str
        (when prefix (str "\"" prefix "\""))
        format-string
        (when suffix (str "\"" suffix "\""))))
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
  (if (or (not unit)
          (lib.schema.temporal-bucketing/time-bucketing-units unit)
          (= :default unit))
    (if-let [time-format (time-format format-settings)]
      (cond->> time-format
        (seq format-string)
        (str format-string ", "))
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
   (->> (date-format format-settings unit)
        (add-time-format format-settings unit))))

(defn- format-settings->format-strings
  "Returns a vector of format strings for a datetime column or number column, corresponding
  to the provided format settings."
  [format-settings {semantic-type  :semantic_type
                    effective-type :effective_type
                    base-type      :base_type
                    unit           :unit :as col}
   format-rows?]
  (when format-rows?
    (let [col-type (streaming.common/col-type col)]
      (u/one-or-many
       (cond
         ;; Primary key or foreign key
         (isa? col-type :Relation/*)
         "0"

         (isa? semantic-type :type/Coordinate)
         nil

         ;; This logic is a guard against someone setting the semantic type of a non-temporal value like 1.0 to temporal.
         ;; It will not apply formatting to the value in this case.
         (and (or (some #(contains? datetime-setting-keys %) (keys format-settings))
                  (isa? semantic-type :type/Temporal))
              (or (isa? effective-type :type/Temporal)
                  (isa? base-type :type/Temporal)))
         (datetime-format-string format-settings unit)

         (or (some #(contains? number-setting-keys %) (keys format-settings))
             (isa? col-type :type/Currency))
         (number-format-strings format-settings))))))

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
                                                              (streaming.common/export-filename-timestamp))}}))

(defn- cell-string-format-style
  [^Workbook workbook ^DataFormat data-format format-string]
  (doto (.createCellStyle workbook)
    (.setDataFormat (. data-format getFormat ^String format-string))))

(defn- compute-column-cell-styles
  "Compute a sequence of cell styles for each column"
  [^Workbook workbook ^DataFormat data-format viz-settings cols format-rows?]
  (for [col cols]
    (let [settings       (streaming.common/viz-settings-for-col col viz-settings)
          format-strings (format-settings->format-strings settings col format-rows?)]
      (when (seq format-strings)
        (mapv
         (partial cell-string-format-style workbook data-format)
         format-strings)))))

(defn- default-format-strings
  "Default strings to use for datetime and number fields if custom format settings are not set."
  []
  {:datetime (datetime-format-string (streaming.common/merge-global-settings {} :type/Temporal))
   :date     (datetime-format-string (streaming.common/merge-global-settings {::mb.viz/time-enabled nil} :type/Temporal))
   ;; Use a fixed format for time fields since time formatting isn't currently supported (#17357)
   :time     "h:mm am/pm"
   :integer  "#,##0"
   :float    "#,##0.##"})

(defn- compute-typed-cell-styles
  "Compute default cell styles based on column types"
  ;; These are tested, but does this happen IRL?
  [^Workbook workbook ^DataFormat data-format]
  (update-vals
   (default-format-strings)
   (partial cell-string-format-style workbook data-format)))

(defn- rounds-to-int?
  "Returns whether a number should be formatted as an integer after being rounded to 2 decimal places."
  [value]
  (let [rounded (.setScale (bigdec value) 2 java.math.RoundingMode/HALF_UP)]
    (== (bigint rounded) rounded)))

(defmulti ^:private set-cell!
  "Sets a cell to the provided value, with an appropriate style if necessary.

  This is based on the equivalent multimethod in Docjure, but adapted to support Metabase viz settings."
  {:arglists '([cell value styles typed-styles])}
  (fn [^Cell _cell value _styles _typed-styles]
    (type value)))

(defmethod set-cell! UUID
  [^Cell cell ^UUID uuid _styles _typed-styles]
  (.setCellValue cell (str uuid)))

;; Temporal values in Excel are just NUMERIC cells that are stored in a floating-point format and have some cell
;; styles applied that dictate how to format them

(defmethod set-cell! LocalDate
  [^Cell cell ^LocalDate t styles typed-styles]
  (.setCellValue cell t)
  (.setCellStyle cell (or (first styles) (typed-styles :date))))

(defmethod set-cell! LocalDateTime
  [^Cell cell ^LocalDateTime t styles typed-styles]
  (.setCellValue cell t)
  (.setCellStyle cell (or (first styles) (typed-styles :datetime))))

(defmethod set-cell! LocalTime
  [^Cell cell t styles typed-styles]
  ;; there's no `.setCellValue` for a `LocalTime` -- but all the built-in impls for `LocalDate` and `LocalDateTime` do
  ;; anyway is convert the date(time) to an Excel datetime floating-point number and then set that.
  ;;
  ;; `DateUtil/convertTime` will convert a *time* string to an Excel number; after that we can set the numeric value
  ;; directly.
  ;;
  ;; See https://poi.apache.org/apidocs/4.1/org/apache/poi/ss/usermodel/DateUtil.html#convertTime-java.lang.String-
  (.setCellValue cell (DateUtil/convertTime (u.date/format "HH:mm:ss" t)))
  (.setCellStyle cell (or (first styles) (typed-styles :time))))

(defmethod set-cell! OffsetTime
  [^Cell cell t styles typed-styles]
  (set-cell! cell (t/local-time (streaming.common/in-result-time-zone t)) styles typed-styles))

(defmethod set-cell! OffsetDateTime
  [^Cell cell t styles typed-styles]
  (set-cell! cell (t/local-date-time (streaming.common/in-result-time-zone t)) styles typed-styles))

(defmethod set-cell! ZonedDateTime
  [^Cell cell t styles typed-styles]
  (set-cell! cell (t/offset-date-time t) styles typed-styles))

(def ^:dynamic *number-of-characters-cell*
  "Total number of characters that a cell can contain, 32767 is the maximum number supported by the cell."
  ;; See https://support.microsoft.com/en-us/office/excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3
  32767)

(defmethod set-cell! String
  [^Cell cell value _styles _typed-styles]
  (.setCellValue cell ^String (u/truncate value *number-of-characters-cell*)))

(defmethod set-cell! Number
  [^Cell cell value styles typed-styles]
  (let [v (double value)]
    (.setCellValue cell v)
    ;; Do not set formatting for ##NaN, ##Inf, or ##-Inf
    (when (u/real-number? v)
      (let [[int-style float-style] styles]
        (if (rounds-to-int? v)
          (.setCellStyle cell (or int-style (typed-styles :integer)))
          (.setCellStyle cell (or float-style (typed-styles :float))))))))

(defmethod set-cell! Boolean
  [^Cell cell value _styles _typed-styles]
  (.setCellValue cell ^Boolean value))

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.server.middleware.json`.
(defmethod set-cell! Object
  [^Cell cell value _styles _typed-styles]
  ;; Ok, this seems a bit strange, but the reason for generating the string and sometimes parsing it again:
  ;; An Object can come in without an encoder (custom encoders can be added with `json.generate/add-encoder`)
  ;; In such cases, we want to just turn that object into a json-encoded string, and be done with it.
  ;; But in cases where the Object DOES have an encoder, we want the encoder's output directly, not wrapped in
  ;; another set of quotes, so we read the encoded result back to 'unwrap' it once.
  ;; And, if we don't encode the value first, we end up with a string of the object's classname, which isn't
  ;; the expected output.
  ;; Finally, we wrap the encoded-obj in `str` in case the custom object's encoding is not a string;
  ;; For simplicity, we'll assume objects are exported as some kind of string, and the value can be parsed
  ;; by the user later somehow
  (let [encoded-obj (cond-> (json/encode value)
                      (json/has-custom-encoder? value) json/decode)]
    (.setCellValue cell (str encoded-obj))))

(defmethod set-cell! nil [^Cell cell _value _styles _typed-styles]
  (.setBlank cell))

(defn- maybe-parse-coordinate-value [value {:keys [semantic_type]}]
  (when (isa? semantic_type :type/Coordinate)
    (try (formatter/format-geographic-coordinates semantic_type value)
         ;; Fallback to plain string value if it couldn't be parsed
         (catch Exception _ value
                value))))

(defn- maybe-parse-temporal-value
  "The format-rows qp middleware formats rows into strings, which circumvents the formatting done in this namespace.
  To gain the formatting back, we parse the temporal strings back into their java.time objects.

  TODO: find a way to avoid this java.time -> string -> java.time conversion by making sure the format-rows middleware
        works effectively with the streaming-results-writer implementations for CSV, JSON, and XLSX.
        A hint towards a better solution is to add into the format-rows middleware the use of
        viz-settings/column-formatting that is used inside `metabase.formatter/create-formatter`."
  [value col]
  (when (and (isa? (or (:base_type col) (:effective_type col)) :type/Temporal)
             (string? value))
    (try (u.date/parse value)
         ;; Fallback to plain string value if it couldn't be parsed
         (catch Exception _ value
                value))))

;; ColumnHelper hack.
;;
;; Starting with Apache POI 5.2.3, when a cell is added, its default style is computed from the styles of the whole
;; column. When exporting big datasets, this creates a lot of unnecessary work. Unfortunately, there is no easy way to
;; undo this other than hacking into private fields to replace the ColumnHelper object with our custom proxy.
;;
;; See https://github.com/apache/poi/blob/0dac5680/poi-ooxml/src/main/java/org/apache/poi/xssf/usermodel/helpers/ColumnHelper.java#L306.

(defn- private-field ^java.lang.reflect.Field [object field-name]
  (doto (.getDeclaredField (class object) field-name)
    (.setAccessible true)))

(defn- sxssfsheet->xssfsheet [sxssfsheet]
  (.get (private-field sxssfsheet "_sh") sxssfsheet))

(defn- xssfsheet->worksheet [xssfsheet]
  (.get (private-field xssfsheet "worksheet") xssfsheet))

(defn- no-style-column-helper
  "Returns a proxy ColumnHelper that always returns `-1` (meaning empty style) as a default column style."
  [worksheet]
  (proxy [org.apache.poi.xssf.usermodel.helpers.ColumnHelper] [worksheet]
    (getColDefaultStyle [idx] -1)))

(defn- set-no-style-custom-helper! [sxssfsheet]
  (let [xssfsheet (sxssfsheet->xssfsheet sxssfsheet)
        new-helper (no-style-column-helper (xssfsheet->worksheet xssfsheet))]
    (.set (private-field xssfsheet "columnHelper") xssfsheet new-helper)))

(defmulti ^:private add-row!
  "Adds a row of values to the spreadsheet. Values with the `scaled` viz setting are scaled prior to being added.

  This is based on the equivalent function in Docjure: [[spreadsheet/add-row!]], but adapted to support Metabase viz
  settings."
  {:arglists '([sheet values cols viz-settings cell-styles typed-cell-styles]
               [sheet row-num values cols viz-settings cell-styles typed-cell-styles])}
  (fn [sheet & _args]
    (class sheet)))

;; TODO this add-row! and the one below (For XSSFSheet) should be consolidated
(defmethod add-row! org.apache.poi.xssf.streaming.SXSSFSheet
  ([^SXSSFSheet sheet values cols viz-settings cell-styles typed-cell-styles]
   (let [row-num (if (= 0 (.getPhysicalNumberOfRows sheet))
                   0
                   (inc (.getLastRowNum sheet)))]
     (add-row! ^SXSSFSheet sheet row-num values cols viz-settings cell-styles typed-cell-styles)))
  ([^SXSSFSheet sheet row-num values cols viz-settings cell-styles typed-cell-styles]
   (let [row     (.createRow sheet ^Integer row-num)
         ;; Using iterators here to efficiently go over multiple collections at once.
         val-it (.iterator ^Iterable values)
         col-it (.iterator ^Iterable cols)
         sty-it (.iterator ^Iterable cell-styles)]
     (loop [index 0]
       (when (.hasNext val-it)
         (let [value (.next val-it)
               col (.next col-it)
               styles (.next sty-it)
               settings     (streaming.common/viz-settings-for-col col viz-settings)
               ;; value can be a column header (a string), so if the column is scaled, it'll try to do (* "count" 7)
               scaled-val   (if (and (number? value) (::mb.viz/scale settings))
                              (* value (::mb.viz/scale settings))
                              value)
               ;; Temporal values are converted into strings in the format-rows QP middleware, which is enabled during
               ;; dashboard subscription/pulse generation. If so, we should parse them here so that formatting is applied.
               parsed-value (or
                             (maybe-parse-temporal-value value col)
                             (maybe-parse-coordinate-value value col)
                             scaled-val)]
           (set-cell! (.createCell ^SXSSFRow row index) parsed-value styles typed-cell-styles))
         (recur (inc index))))
     row)))

(defmethod add-row! org.apache.poi.xssf.usermodel.XSSFSheet
  ([^XSSFSheet sheet values cols viz-settings cell-styles typed-cell-styles]
   (let [row-num (if (= 0 (.getPhysicalNumberOfRows sheet))
                   0
                   (inc (.getLastRowNum sheet)))]
     (add-row! ^XSSFSheet sheet row-num values cols viz-settings cell-styles typed-cell-styles)))
  ([^XSSFSheet sheet row-num values cols viz-settings cell-styles typed-cell-styles]
   (let [row     (.createRow sheet ^Integer row-num)
         ;; Using iterators here to efficiently go over multiple collections at once.
         val-it (.iterator ^Iterable values)
         col-it (.iterator ^Iterable cols)
         sty-it (.iterator ^Iterable cell-styles)]
     (loop [index 0]
       (when (.hasNext val-it)
         (let [value (.next val-it)
               col (.next col-it)
               styles (.next sty-it)
               settings     (streaming.common/viz-settings-for-col col viz-settings)
               ;; value can be a column header (a string), so if the column is scaled, it'll try to do (* "count" 7)
               scaled-val   (if (and (number? value) (::mb.viz/scale settings))
                              (* value (::mb.viz/scale settings))
                              value)
               ;; Temporal values are converted into strings in the format-rows QP middleware, which is enabled during
               ;; dashboard subscription/pulse generation. If so, we should parse them here so that formatting is applied.
               parsed-value (or
                             (maybe-parse-temporal-value value col)
                             (maybe-parse-coordinate-value value col)
                             scaled-val)]
           (set-cell! (.createCell ^XSSFRow row index) parsed-value styles typed-cell-styles))
         (recur (inc index))))
     row)))

(defn write-pivot-table!
  "Writes pivoted data to the provided sheet as-is, without additional formatting applied."
  [^SXSSFSheet sheet pivot-output typed-cell-styles viz-settings]
  (doseq [[row-idx row] (map-indexed vector pivot-output)]
    (let [^SXSSFRow excel-row (.createRow ^SXSSFSheet sheet ^Integer row-idx)]
      (doseq [[col-idx cell-data] (map-indexed vector row)]
        (let [{:keys [col styles value]}
              (if (map? cell-data)
                cell-data
                ;; Fallback: assume it's just a value, no metadata
                {:value cell-data
                 :col   {}})
              ^Cell cell   (.createCell excel-row ^Integer col-idx)
              settings     (streaming.common/viz-settings-for-col col viz-settings)
              scaled-val   (if (and (number? value) (::mb.viz/scale settings))
                             (* value (::mb.viz/scale settings))
                             value)
              parsed-value (or (maybe-parse-temporal-value value col)
                               (maybe-parse-coordinate-value value col)
                               scaled-val)]
          (set-cell! cell parsed-value styles typed-cell-styles))))))

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

;; Possible Functions: https://poi.apache.org/apidocs/dev/org/apache/poi/ss/usermodel/DataConsolidateFunction.html
;; I'm only including the keys that seem to work for our Pivot Tables as of 2024-06-06
(defn- col->aggregation-fn
  [{agg-name :name source :source}]
  (when (= :aggregation source)
    (let [agg-name (u/lower-case-en agg-name)]
      (cond
        (str/starts-with? agg-name "sum")    DataConsolidateFunction/SUM
        (str/starts-with? agg-name "avg")    DataConsolidateFunction/AVERAGE
        (str/starts-with? agg-name "min")    DataConsolidateFunction/MIN
        (str/starts-with? agg-name "max")    DataConsolidateFunction/MAX
        (str/starts-with? agg-name "count")  DataConsolidateFunction/COUNT
        (str/starts-with? agg-name "stddev") DataConsolidateFunction/STD_DEV))))

(defn pivot-opts->pivot-spec
  "Utility that adds :pivot-grouping-key to the pivot-opts map internal to the xlsx streaming response writer."
  [pivot-opts cols]
  (let [titles  (mapv :display_name cols)
        agg-fns (mapv col->aggregation-fn cols)]
    (-> pivot-opts
        (assoc :column-titles titles)
        qp.pivot.postprocess/add-pivot-measures
        (assoc :aggregation-functions agg-fns)
        (assoc :pivot-grouping-key (qp.pivot.postprocess/pivot-grouping-index titles)))))

(defn- track-n-cols-for-autosizing!
  [n sheet]
  (doseq [i (range n)]
    (.trackColumnForAutoSizing ^SXSSFSheet sheet i)))

(defn- init-workbook
  "Initializes the provided workbook, and returns the created sheet"
  [{:keys [workbook ordered-cols col-count viz-settings format-rows? pivot?]}]
  (let [sheet (spreadsheet/add-sheet! workbook (tru "Query result"))]
    (track-n-cols-for-autosizing! (or col-count (count ordered-cols)) sheet)
    (when (not pivot?)
      (setup-header-row! sheet (count ordered-cols))
      (spreadsheet/add-row! sheet (streaming.common/column-titles ordered-cols (or viz-settings {})  format-rows?)))
    sheet))

(defn get-formatter
  "Returns a memoized formatter for a column"
  [timezone settings format-rows?]
  (memoize
   (fn [column]
     (formatter/create-formatter timezone column settings format-rows?))))

(defn- create-formatters
  [cell-styles cols indexes timezone settings format-rows?]
  (let [cell-styles  (vec cell-styles)
        cols         (vec cols)
        formatter-fn (get-formatter timezone settings format-rows?)]
    (mapv (fn [idx]
            (let [col (nth cols idx)
                  formatter (formatter-fn col)]
              (fn [value]
                {:col                  (nth cols idx)
                 :value                value
                 :xlsx-formatted-value (formatter (streaming.common/format-value value))
                 :styles               (nth cell-styles idx)})))
          indexes)))

(defn- make-formatters
  [cell-styles cols row-indexes col-indexes val-indexes settings timezone format-rows?]
  {:row-formatters (create-formatters cell-styles cols row-indexes timezone settings format-rows?)
   :col-formatters (create-formatters cell-styles cols col-indexes timezone settings format-rows?)
   :val-formatters (create-formatters cell-styles cols val-indexes timezone settings format-rows?)})

(defn- generate-styles
  [workbook viz-settings non-pivot-cols format-rows?]
  (let [data-format (. ^SXSSFWorkbook workbook createDataFormat)]
    {:cell-styles (compute-column-cell-styles workbook data-format viz-settings non-pivot-cols format-rows?)
     :typed-cell-styles (compute-typed-cell-styles workbook data-format)}))

(defmethod qp.si/streaming-results-writer :xlsx
  [_ ^OutputStream os]
  (let [workbook             (SXSSFWorkbook.)
        workbook-sheet       (volatile! nil)
        styles               (volatile! nil)
        pivot-data           (volatile! nil)
        pivot-grouping-index (volatile! nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows? pivot? pivot-export-options]
                   :or   {format-rows? true
                          pivot?       false}} :data}
               viz-settings]
        (let [pivot-spec       (when (and pivot? pivot-export-options (qp.settings/enable-pivoted-exports))
                                 (pivot-opts->pivot-spec (merge {:pivot-cols []
                                                                 :pivot-rows []}
                                                                (m/filter-vals some? pivot-export-options)) ordered-cols))
              non-pivot-cols (pivot/columns-without-pivot-group ordered-cols)]
          (vreset! pivot-grouping-index (qp.pivot.postprocess/pivot-grouping-index (mapv :display_name ordered-cols)))
          (if pivot-spec
            ;; If we're generating a pivot table, just initialize the `pivot-data` volatile but not the workbook, yet
            (vreset! pivot-data
                     {:settings             viz-settings
                      :non-pivot-cols       non-pivot-cols
                      :data                 {:cols (vec ordered-cols)
                                             :rows (transient [])}
                      :timezone             results_timezone
                      :format-rows?         format-rows?
                      :pivot-export-options pivot-export-options})
            (let [sheet (init-workbook {:workbook     workbook
                                        :ordered-cols non-pivot-cols
                                        :viz-settings viz-settings
                                        :format-rows? true})]
              (set-no-style-custom-helper! sheet)
              (vreset! styles (generate-styles workbook viz-settings non-pivot-cols format-rows?))
              (vreset! workbook-sheet sheet)))))

      (write-row! [_ row row-num ordered-cols {:keys [output-order] :as viz-settings}]
        (let [ordered-row          (vec (if output-order
                                          (let [row-v (into [] row)]
                                            (for [i output-order] (row-v i)))
                                          row))
              group                (get row @pivot-grouping-index)
              [row' ordered-cols'] (cond->> [ordered-row ordered-cols]
                                     @pivot-grouping-index
                                     ;; We need to remove the pivot-grouping key if it's there, because we don't show
                                     ;; it in the export. `ordered-cols` is a parallel array, so we must remove the
                                     ;; corresponding col.
                                     (map #(m/remove-nth @pivot-grouping-index %)))]
          (if @pivot-data
            (vswap! pivot-data update-in [:data :rows] conj! ordered-row)
            (when (or (not group)
                      (= qp.pivot.postprocess/non-pivot-row-group (int group)))
              (let [{:keys [cell-styles typed-cell-styles]} @styles]
                (add-row! @workbook-sheet (inc row-num) row' ordered-cols' viz-settings cell-styles typed-cell-styles)
                (when (= (inc row-num) *auto-sizing-threshold*)
                  (autosize-columns! @workbook-sheet)))))))

      (finish! [_ {:keys [row_count]}]
        (when @pivot-data
          ;; For pivoted exports, we pivot in-memory (same as CSVs) and then write the results to the
          ;; document all at once
          (let [{:keys [settings non-pivot-cols pivot-export-options timezone format-rows?]} @pivot-data
                {:keys [pivot-rows pivot-cols pivot-measures]} pivot-export-options

                {:keys [cell-styles typed-cell-styles]}
                (generate-styles workbook settings non-pivot-cols format-rows?)

                formatters (make-formatters cell-styles
                                            non-pivot-cols
                                            pivot-rows
                                            pivot-cols
                                            pivot-measures
                                            settings
                                            timezone
                                            format-rows?)
                output (qp.pivot.postprocess/build-pivot-output
                        (update-in @pivot-data [:data :rows] persistent!)
                        formatters)
                sheet (init-workbook {:workbook     workbook
                                      :pivot?       true
                                      :col-count    (count (first output))
                                      :format-rows? true})]
            (vreset! workbook-sheet sheet)
            (set-no-style-custom-helper! sheet)
            (write-pivot-table! sheet output typed-cell-styles settings)))
        (when (or (nil? row_count)
                  (< row_count *auto-sizing-threshold*)
                  @pivot-data)
          ;; Auto-size columns if we never hit the row threshold, or a final row count was not provided
          (autosize-columns! @workbook-sheet))
        (try
          (spreadsheet/save-workbook-into-stream! os workbook)
          (finally
            (.dispose ^SXSSFWorkbook workbook)
            (.close os)))))))
