(ns metabase.query-processor.streaming.ods
  "OpenDocument Spreadsheet (ODS) query results export."
  (:refer-clojure :exclude [mapv])
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.pivot.core :as pivot]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.settings :as qp.settings]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.query-processor.streaming.xlsx :as qp.xlsx]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.performance :refer [mapv]])
  (:import
   (java.io OutputStream)
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.util List UUID)
   (org.apache.poi.xssf.streaming SXSSFWorkbook)
   (org.odftoolkit.odfdom.doc OdfSpreadsheetDocument)
   (org.odftoolkit.odfdom.doc.table OdfTable OdfTableCell OdfTableRow)))

(set! *warn-on-reflection* true)

;; ODS reuses pivot parsing, POI style workbook generation, and per-column value parsing from
;; `metabase.query-processor.streaming.xlsx` without duplicating a large code path. Those
;; fns are still `defn-` in `xlsx` — we resolve them with [[requiring-resolve]] + deref. If
;; the coupling becomes painful, extract shared helpers into `streaming.common` or relax
;; visibility in `xlsx.clj` instead.
(def ^:private maybe-parse-temporal
  @(requiring-resolve 'metabase.query-processor.streaming.xlsx/maybe-parse-temporal-value))

(def ^:private maybe-parse-coordinate
  @(requiring-resolve 'metabase.query-processor.streaming.xlsx/maybe-parse-coordinate-value))

(def ^:private xlsx-generate-styles
  @(requiring-resolve 'metabase.query-processor.streaming.xlsx/generate-styles))

(def ^:private xlsx-make-formatters
  @(requiring-resolve 'metabase.query-processor.streaming.xlsx/make-formatters))

(defmethod qp.si/stream-options :ods
  ([_]
   (qp.si/stream-options :ods "query_result"))
  ([_ filename-prefix]
   {:content-type              "application/vnd.oasis.opendocument.spreadsheet"
    :write-keepalive-newlines? false
    :status                    200
    :headers                   {"Content-Disposition" (format "attachment; filename=\"%s_%s.ods\""
                                                              (or filename-prefix "query_result")
                                                              (streaming.common/export-filename-timestamp))}}))

(defmulti ^:private set-ods-cell!
  {:arglists '([cell value])}
  (fn [_cell value] (type value)))

(defmethod set-ods-cell! nil
  [^OdfTableCell cell _value]
  (.setStringValue cell ""))

(defmethod set-ods-cell! UUID
  [^OdfTableCell cell ^UUID uuid]
  (.setStringValue cell (str uuid)))

(defmethod set-ods-cell! String
  [^OdfTableCell cell ^String s]
  (.setStringValue cell s))

(defmethod set-ods-cell! Number
  [^OdfTableCell cell value]
  (let [v (double value)]
    (if (u/real-number? v)
      (.setDoubleValue cell v)
      (.setStringValue cell (str v)))))

(defmethod set-ods-cell! Boolean
  [^OdfTableCell cell ^Boolean b]
  (.setBooleanValue cell b))

(defmethod set-ods-cell! LocalDate
  [^OdfTableCell cell ^LocalDate d]
  (.setStringValue cell (u.date/format d)))

(defmethod set-ods-cell! LocalDateTime
  [^OdfTableCell cell ^LocalDateTime d]
  (.setStringValue cell (u.date/format d)))

(defmethod set-ods-cell! LocalTime
  [^OdfTableCell cell ^LocalTime tm]
  (.setStringValue cell (u.date/format tm)))

(defmethod set-ods-cell! OffsetTime
  [^OdfTableCell cell t]
  (set-ods-cell! cell (t/local-time (streaming.common/in-result-time-zone t))))

(defmethod set-ods-cell! OffsetDateTime
  [^OdfTableCell cell t]
  (set-ods-cell! cell (t/local-date-time (streaming.common/in-result-time-zone t))))

(defmethod set-ods-cell! ZonedDateTime
  [^OdfTableCell cell t]
  (set-ods-cell! cell (t/offset-date-time t)))

(defmethod set-ods-cell! Object
  [^OdfTableCell cell value]
  (let [encoded-obj (cond-> (json/encode value)
                      (json/has-custom-encoder? value) json/decode)]
    (.setStringValue cell (str encoded-obj))))

(defn- first-spreadsheet-table
  "Return the first ODF table in a new spreadsheet (template includes one sheet table)."
  [^OdfSpreadsheetDocument doc]
  (.get ^List (.getSpreadsheetTables doc) 0))

(defn- init-ods-table!
  "First table in a new ODS document: set name and header row 0 from column metadata."
  [^OdfSpreadsheetDocument doc ordered-cols viz-settings format-rows?]
  (let [^OdfTable table (first-spreadsheet-table doc)
        titles          (vec (streaming.common/column-titles ordered-cols (or viz-settings {}) format-rows?))
        ^OdfTableRow row (.getRowByIndex table 0)]
    (.setTableName table (str (tru "Query result")))
    (doseq [[i label] (map-indexed vector titles)]
      (-> (.getCellByIndex row i) (.setStringValue (str label))))
    table))

(defn- add-ods-data-row!
  [^OdfTable table values cols viz-settings cell-styles _typed-cell-styles]
  (let [^OdfTableRow row (.appendRow table)
        val-it (.iterator ^Iterable values)
        col-it (.iterator ^Iterable cols)
        sty-it (.iterator ^Iterable cell-styles)]
    (loop [index 0]
      (when (.hasNext val-it)
        (let [value (.next val-it)
              col   (.next col-it)
              _styles (.next sty-it)
              settings (streaming.common/viz-settings-for-col col viz-settings)
              scaled-val (if (and (number? value) (::mb.viz/scale settings))
                           (* value (::mb.viz/scale settings))
                           value)
              parsed-value (or (maybe-parse-temporal value col)
                               (maybe-parse-coordinate value col)
                               scaled-val)
              ^OdfTableCell cell (.getCellByIndex row index)]
          (set-ods-cell! cell parsed-value)
          (recur (inc index)))))))

(defn- write-ods-pivot-table!
  [^OdfTable table pivot-output viz-settings]
  (doseq [[row-idx row] (map-indexed vector pivot-output)]
    (let [^OdfTableRow ods-row (.getRowByIndex table row-idx)]
      (doseq [[col-idx cell-data] (map-indexed vector row)]
        (let [{:keys [col value]}
              (if (map? cell-data)
                cell-data
                {:value cell-data, :col {}})
              ^OdfTableCell cell (.getCellByIndex ods-row col-idx)
              settings (streaming.common/viz-settings-for-col col viz-settings)
              scaled-val (if (and (number? value) (::mb.viz/scale settings))
                           (* value (::mb.viz/scale settings))
                           value)
              parsed-value (or (maybe-parse-temporal value col)
                               (maybe-parse-coordinate value col)
                               scaled-val)]
          (if (and (map? parsed-value) (contains? parsed-value :xlsx-formatted-value))
            (set-ods-cell! cell (:xlsx-formatted-value parsed-value))
            (set-ods-cell! cell parsed-value)))))))

(defmethod qp.si/streaming-results-writer :ods
  [_ ^OutputStream os]
  (let [workbook              (SXSSFWorkbook.)
        ods-doc               (volatile! nil)
        ods-table             (volatile! nil)
        styles                (volatile! nil)
        pivot-data            (volatile! nil)
        pivot-grouping-index  (volatile! nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows? pivot? pivot-export-options]
                   :or   {format-rows? true
                          pivot?       false}} :data}
               viz-settings]
        (let [pivot-spec (when (and pivot? pivot-export-options (qp.settings/enable-pivoted-exports))
                           (qp.xlsx/pivot-opts->pivot-spec (merge {:pivot-cols []
                                                                   :pivot-rows []}
                                                                  (m/filter-vals some? pivot-export-options))
                                                           ordered-cols))
              non-pivot-cols (pivot/columns-without-pivot-group ordered-cols)]
          (vreset! pivot-grouping-index (qp.pivot.postprocess/pivot-grouping-index (mapv :display_name ordered-cols)))
          (if pivot-spec
            (vreset! pivot-data {:settings             viz-settings
                                 :non-pivot-cols       non-pivot-cols
                                 :data                 {:cols (vec ordered-cols)
                                                        :rows (transient [])}
                                 :timezone             results_timezone
                                 :format-rows?         format-rows?
                                 :pivot-export-options pivot-export-options})
            (let [^OdfSpreadsheetDocument doc (OdfSpreadsheetDocument/newSpreadsheetDocument)
                  table (init-ods-table! doc non-pivot-cols viz-settings true)]
              (vreset! ods-doc doc)
              (vreset! ods-table table)
              (vreset! styles (xlsx-generate-styles workbook viz-settings non-pivot-cols format-rows?))))))

      (write-row! [_ row _row-num ordered-cols {:keys [output-order] :as viz-settings}]
        (let [ordered-row  (vec (if output-order
                                  (let [row-v (into [] row)]
                                    (for [i output-order] (row-v i)))
                                  row))
              group        (get row @pivot-grouping-index)
              [row' ordered-cols'] (cond->> [ordered-row ordered-cols]
                                     @pivot-grouping-index
                                     (map #(m/remove-nth @pivot-grouping-index %)))]
          (if @pivot-data
            (vswap! pivot-data update-in [:data :rows] conj! row')
            (when (or (not group)
                      (= qp.pivot.postprocess/non-pivot-row-group (int group)))
              (let [{:keys [cell-styles typed-cell-styles]} @styles]
                (add-ods-data-row! @ods-table row' ordered-cols' viz-settings cell-styles typed-cell-styles))))))

      (finish! [_ _]
        (try
          (when @pivot-data
            (let [{:keys [settings non-pivot-cols pivot-export-options timezone format-rows?]} @pivot-data
                  {:keys [pivot-rows pivot-cols pivot-measures]} pivot-export-options
                  {:keys [cell-styles]} (xlsx-generate-styles
                                         workbook
                                         settings
                                         non-pivot-cols
                                         format-rows?)
                  formatters (xlsx-make-formatters cell-styles
                                                   non-pivot-cols
                                                   pivot-rows
                                                   pivot-cols
                                                   pivot-measures
                                                   settings
                                                   timezone
                                                   format-rows?)
                  output   (qp.pivot.postprocess/build-pivot-output
                            (update-in @pivot-data [:data :rows] persistent!)
                            formatters)
                  ^OdfSpreadsheetDocument doc (OdfSpreadsheetDocument/newSpreadsheetDocument)
                  ncols   (if (seq output) (count (first output)) 0)
                  nrows   (count output)
                  ^OdfTable table (OdfTable/newTable doc
                                                     (int (max nrows 1))
                                                     (int (max ncols 1)))]
              (vreset! ods-doc doc)
              (vreset! ods-table table)
              (write-ods-pivot-table! table output settings)))
          (if-let [^OdfSpreadsheetDocument d @ods-doc]
            (.save d os)
            (throw (ex-info (tru "ODS document was not initialized") {})))
          (finally
            (.dispose ^SXSSFWorkbook workbook)
            (.close os)))))))
