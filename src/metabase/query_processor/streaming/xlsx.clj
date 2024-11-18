(ns metabase.query-processor.streaming.xlsx
  (:require
   [cheshire.core :as json]
   [cheshire.generate :as json.generate]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.formatter :as formatter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util :as u]
   [metabase.util.currency :as currency]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.io OutputStream)
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (org.apache.poi.openxml4j.util ZipSecureFile)
   (org.apache.poi.ss SpreadsheetVersion)
   (org.apache.poi.ss.usermodel Cell DataConsolidateFunction DataFormat DateUtil Workbook)
   (org.apache.poi.ss.util AreaReference CellRangeAddress CellReference)
   (org.apache.poi.xssf.streaming SXSSFRow SXSSFSheet SXSSFWorkbook)
   (org.apache.poi.xssf.usermodel XSSFPivotTable XSSFRow XSSFSheet XSSFWorkbook)
   (org.openxmlformats.schemas.spreadsheetml.x2006.main STFieldSortType)))

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
        currency-identifier (common/currency-identifier format-settings)]
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
                                ;; Omit thousands separator if ommitted in the format settings. Otherwise ignore
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
    (let [col-type (common/col-type col)]
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
                                                              (u.date/format (t/zoned-date-time)))}}))

(defn- cell-string-format-style
  [^Workbook workbook ^DataFormat data-format format-string]
  (doto (.createCellStyle workbook)
    (.setDataFormat (. data-format getFormat ^String format-string))))

(defn- compute-column-cell-styles
  "Compute a sequence of cell styles for each column"
  [^Workbook workbook ^DataFormat data-format viz-settings cols format-rows?]
  (for [col cols]
    (let [settings       (common/viz-settings-for-col col viz-settings)
          format-strings (format-settings->format-strings settings col format-rows?)]
      (when (seq format-strings)
        (mapv
         (partial cell-string-format-style workbook data-format)
         format-strings)))))

(defn- default-format-strings
  "Default strings to use for datetime and number fields if custom format settings are not set."
  []
  {:datetime (datetime-format-string (common/merge-global-settings {} :type/Temporal))
   :date     (datetime-format-string (common/merge-global-settings {::mb.viz/time-enabled nil} :type/Temporal))
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
  (fn [^Cell _cell value _styles _typed-styles]
    (type value)))

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
  (set-cell! cell (t/local-time (common/in-result-time-zone t)) styles typed-styles))

(defmethod set-cell! OffsetDateTime
  [^Cell cell t styles typed-styles]
  (set-cell! cell (t/local-date-time (common/in-result-time-zone t)) styles typed-styles))

(defmethod set-cell! ZonedDateTime
  [^Cell cell t styles typed-styles]
  (set-cell! cell (t/offset-date-time t) styles typed-styles))

(defmethod set-cell! String
  [^Cell cell value _styles _typed-styles]
  (.setCellValue cell ^String value))

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
                      (contains? (:impls json.generate/JSONable) (type value)) json/parse-string)]
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

  TODO: find a way to avoid this java.time -> string -> java.time conversion by making sure the format-rows middlware
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

(defn- set-no-style-custom-helper [sxssfsheet]
  (let [xssfsheet (sxssfsheet->xssfsheet sxssfsheet)
        new-helper (no-style-column-helper (xssfsheet->worksheet xssfsheet))]
    (.set (private-field xssfsheet "columnHelper") xssfsheet new-helper)))

(defmulti ^:private add-row!
  "Adds a row of values to the spreadsheet. Values with the `scaled` viz setting are scaled prior to being added.

  This is based on the equivalent function in Docjure, but adapted to support Metabase viz settings."
  {:arglists '([sheet values cols col-settings cell-styles typed-cell-styles]
               [sheet row-num values cols col-settings cell-styles typed-cell-styles])}
  (fn [sheet & _args]
    (class sheet)))

(defmethod add-row! org.apache.poi.xssf.streaming.SXSSFSheet
  ([^SXSSFSheet sheet values cols col-settings cell-styles typed-cell-styles]
   (let [row-num (if (= 0 (.getPhysicalNumberOfRows sheet))
                   0
                   (inc (.getLastRowNum sheet)))]
     (add-row! ^SXSSFSheet sheet row-num values cols col-settings cell-styles typed-cell-styles)))
  ([^SXSSFSheet sheet row-num values cols col-settings cell-styles typed-cell-styles]
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
               id-or-name   (or (:id col) (:name col))
               settings     (or (get col-settings {::mb.viz/field-id id-or-name})
                                (get col-settings {::mb.viz/column-name id-or-name}))
               scaled-val   (if (and value (::mb.viz/scale settings))
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
  ([^XSSFSheet sheet values cols col-settings cell-styles typed-cell-styles]
   (let [row-num (if (= 0 (.getPhysicalNumberOfRows sheet))
                   0
                   (inc (.getLastRowNum sheet)))]
     (add-row! ^XSSFSheet sheet row-num values cols col-settings cell-styles typed-cell-styles)))
  ([^XSSFSheet sheet row-num values cols col-settings cell-styles typed-cell-styles]
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
               id-or-name   (or (:id col) (:name col))
               settings     (or (get col-settings {::mb.viz/field-id id-or-name})
                                (get col-settings {::mb.viz/column-name id-or-name}))
               scaled-val   (if (and value (::mb.viz/scale settings))
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
        (assoc :pivot-grouping-key (qp.pivot.postprocess/pivot-grouping-key titles)))))

;; Below, we need to provide an AreaReference to create a pivot table.
;; Creating an AreaReference will 'realize' every CellReference inside it, and so the larger the AreaReference,
;; the more memory we use, and the larger the filesize.
;; Unfortunately, we can't avoid this, so we try to only create a reference that matches the row count, which we can
;; only estimate using fingerprint distinct counts (which cannot be guaranteed correct).
;; So, by default we use some large number as a basis.
;; We have to set the min Inflate Ratio lower than the default's 0.01 because otherwise we get a 'zip bomb detected' error.
;; Since we're the ones creating the file, we can lower the ratio to get what we want.
(ZipSecureFile/setMinInflateRatio 0.001)
(defn- init-native-pivot
  [{:keys [pivot-grouping-key column-sort-order] :as pivot-spec}
   {:keys [ordered-cols col-settings viz-settings format-rows?]}]
  (let [idx-shift                   (fn [indices]
                                      (map (fn [idx]
                                             (if (> idx pivot-grouping-key)
                                               (dec idx)
                                               idx)) indices))
        ordered-cols                (vec (m/remove-nth pivot-grouping-key ordered-cols))
        pivot-rows                  (idx-shift (:pivot-rows pivot-spec))
        pivot-cols                  (idx-shift (:pivot-cols pivot-spec))
        pivot-measures              (idx-shift (:pivot-measures pivot-spec))
        ;; for now, these are unused, since the rows from qp.pivot will already contain their aggregated values
        _aggregation-functions      (vec (m/remove-nth pivot-grouping-key (:aggregation-functions pivot-spec)))
        wb                          (spreadsheet/create-workbook
                                     "pivot" [[]]
                                     "data" [])
        data-format                 (. ^XSSFWorkbook wb createDataFormat)
        cell-styles                 (compute-column-cell-styles wb data-format viz-settings ordered-cols format-rows?)
        typed-cell-styles           (compute-typed-cell-styles wb data-format)
        data-sheet                  (spreadsheet/select-sheet "data" wb)
        pivot-sheet                 (spreadsheet/select-sheet "pivot" wb)
        col-names                   (common/column-titles ordered-cols col-settings format-rows?)
        _                           (add-row! data-sheet col-names ordered-cols col-settings cell-styles typed-cell-styles)
        ;; keep the initial area-ref small (only 2 rows) so that adding row and column labels keeps the pivot table
        ;; object small.
        area-ref                    (AreaReference.
                                     (format "A1:%s2" (CellReference/convertNumToColString (dec (count ordered-cols))))
                                     SpreadsheetVersion/EXCEL2007)
        ^XSSFPivotTable pivot-table (.createPivotTable ^XSSFSheet pivot-sheet
                                                       ^AreaReference area-ref
                                                       (CellReference. 0 0)
                                                       ^XSSFSheet data-sheet)]
    (doseq [idx pivot-rows]
      (.addRowLabel pivot-table idx))
    (doseq [idx pivot-cols]
      (.addColLabel pivot-table idx))
    (doseq [idx pivot-measures]
      (.addColumnLabel pivot-table DataConsolidateFunction/SUM #_(get aggregation-functions idx DataConsolidateFunction/SUM) idx))
    (doseq [[idx sort-setting] column-sort-order]
      (let [setting (case sort-setting
                      :ascending STFieldSortType/ASCENDING
                      :descending STFieldSortType/DESCENDING)]
        (when setting
          (-> pivot-table
              .getCTPivotTableDefinition
              .getPivotFields
              (.getPivotFieldArray idx)
              (.setSortType setting)))))
    ;; now that the Pivot Table Rows and Cols are set, we can update the area-ref
    (-> pivot-table
        .getPivotCacheDefinition
        .getCTPivotCacheDefinition
        .getCacheSource
        .getWorksheetSource
        (.setRef (format "A:%s" (CellReference/convertNumToColString (dec (count ordered-cols))))))
    (let [swb   (-> (SXSSFWorkbook. ^XSSFWorkbook wb)
                    (doto (.setCompressTempFiles true)))
          sheet (spreadsheet/select-sheet "data" swb)]
      (doseq [i (range (count ordered-cols))]
        (.trackColumnForAutoSizing ^SXSSFSheet sheet i))
      (setup-header-row! sheet (count ordered-cols))
      {:workbook swb
       :sheet    sheet})))

(defn- init-workbook
  [{:keys [ordered-cols col-settings format-rows?]}]
  (let [workbook (SXSSFWorkbook.)
        sheet    (spreadsheet/add-sheet! workbook (tru "Query result"))]
    (doseq [i (range (count ordered-cols))]
      (.trackColumnForAutoSizing ^SXSSFSheet sheet i))
    (setup-header-row! sheet (count ordered-cols))
    (spreadsheet/add-row! sheet (common/column-titles ordered-cols col-settings format-rows?))
    {:workbook workbook
     :sheet    sheet}))

(defmethod qp.si/streaming-results-writer :xlsx
  [_ ^OutputStream os]
  ;; working around a bug #41919. Will be fixed when we can get a release of apache poi 5.3.1. See
  ;; https://bz.apache.org/bugzilla/show_bug.cgi?id=69323
  (let [f (io/file (str (System/getProperty "java.io.tmpdir") "/poifiles"))]
    (when-not (.exists f)
      (.mkdirs f)))
  (let [workbook-data      (volatile! nil)
        cell-styles        (volatile! nil)
        typed-cell-styles  (volatile! nil)
        pivot-grouping-idx (volatile! nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols format-rows? pivot? pivot-export-options]
                   :or   {format-rows? true
                          pivot?       false}} :data}
               {col-settings ::mb.viz/column-settings :as viz-settings}]
        (let [opts               (when (and pivot? pivot-export-options)
                                   (pivot-opts->pivot-spec (merge {:pivot-cols []
                                                                   :pivot-rows []}
                                                                  pivot-export-options) ordered-cols))
              col-names          (common/column-titles ordered-cols (::mb.viz/column-settings viz-settings) format-rows?)
              pivot-grouping-key (qp.pivot.postprocess/pivot-grouping-key col-names)]
          (when pivot-grouping-key (vreset! pivot-grouping-idx pivot-grouping-key))
          (if opts
            (let [wb (init-native-pivot opts
                                        {:ordered-cols ordered-cols
                                         :col-settings col-settings
                                         :viz-settings viz-settings
                                         :format-rows? format-rows?})]
              (vreset! workbook-data wb))
            (let [wb (init-workbook {:ordered-cols (cond->> ordered-cols
                                                     pivot-grouping-key (m/remove-nth pivot-grouping-key))
                                     :col-settings col-settings
                                     :format-rows? true})]
              (vreset! workbook-data wb)))

          (let [{:keys [workbook sheet]} @workbook-data
                data-format              (. ^SXSSFWorkbook workbook createDataFormat)
                cols                     (cond->> ordered-cols
                                           pivot-grouping-key (m/remove-nth pivot-grouping-key))]
            (set-no-style-custom-helper sheet)
            (vreset! cell-styles (compute-column-cell-styles workbook data-format viz-settings cols format-rows?))
            (vreset! typed-cell-styles (compute-typed-cell-styles workbook data-format)))))

      (write-row! [_ row row-num ordered-cols {:keys [output-order] :as viz-settings}]
        (let [ordered-row        (vec (if output-order
                                        (let [row-v (into [] row)]
                                          (for [i output-order] (row-v i)))
                                        row))
              col-settings       (::mb.viz/column-settings viz-settings)
              pivot-grouping-key @pivot-grouping-idx
              group              (get row pivot-grouping-key)
              modified-row       (cond->> ordered-row
                                   pivot-grouping-key (m/remove-nth pivot-grouping-key))
              {:keys [sheet]}    @workbook-data]
          (when (or (not group)
                    (= qp.pivot.postprocess/NON_PIVOT_ROW_GROUP (int group)))
            (add-row! sheet (inc row-num) modified-row ordered-cols col-settings @cell-styles @typed-cell-styles)
            (when (= (inc row-num) *auto-sizing-threshold*)
              (autosize-columns! sheet)))))

      (finish! [_ {:keys [row_count]}]
        (let [{:keys [workbook sheet]} @workbook-data]
          (when (or (nil? row_count) (< row_count *auto-sizing-threshold*))
                ;; Auto-size columns if we never hit the row threshold, or a final row count was not provided
            (autosize-columns! sheet))
          (try
            (spreadsheet/save-workbook-into-stream! os workbook)
            (finally
              (.dispose ^SXSSFWorkbook workbook)
              (.close os))))))))
