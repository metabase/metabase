(ns metabase.query-processor.streaming.csv
  (:require
   [clojure.data.csv]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.formatter :as formatter]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util.date-2 :as u.date]
   [metabase.util.performance :as perf])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defmethod qp.si/stream-options :csv
  ([_]
   (qp.si/stream-options :csv "query_result"))
  ([_ filename-prefix]
   {:content-type              "text/csv"
    :status                    200
    :headers                   {"Content-Disposition" (format "attachment; filename=\"%s_%s.csv\""
                                                              (or filename-prefix "query_result")
                                                              (u.date/format (t/zoned-date-time)))}
    :write-keepalive-newlines? false}))

;; As a first step towards hollistically solving this issue: https://github.com/metabase/metabase/issues/44556
;; (which is basically that very large pivot tables can crash the export process),
;; The post processing is disabled completely.
;; This should remain `false` until it's fixed
;; TODO: rework this post-processing once there's a clear way in app to enable/disable it, or to select alternate download options
(def ^:dynamic *pivot-export-post-processing-enabled*
  "Flag to enable/disable export post-processing of pivot tables.
  Disabled by default and should remain disabled until Issue #44556 is resolved and a clear plan is made."
  false)

(defn- write-csv
  "Custom implementation of `clojure.data.csv/write-csv` with a more efficient quote? predicate and no support for
  options (we don't use them)."
  [writer data]
  (let [separator \,
        quote \"
        quote? (fn [^String s]
                 (let [n (.length s)]
                   (loop [i 0]
                     (if (>= i n) false
                         (let [ch (.charAt s (unchecked-int i))]
                           (if (or (= ch \,) ;; separator
                                   (= ch \") ;; quote
                                   (= ch \return)
                                   (= ch \newline))
                             true
                             (recur (unchecked-inc i))))))))
        newline "\n"]
    (#'clojure.data.csv/write-csv* writer data separator quote quote? newline)))

;; Rebind write-cell to avoid using clojure.core/escape. Instead, use String.replace with known arguments (we never
;; change quote symbol anyway).
(.bindRoot #'clojure.data.csv/write-cell
           (fn [^java.io.Writer writer obj _ _ quote?]
             (let [^String string (str obj)
                   must-quote (quote? string)]
               (when must-quote (.write writer "\""))
               (.write writer (if must-quote
                                (.replace string "\"" "\"\"")
                                string))
               (when must-quote (.write writer "\"")))))

(defmethod qp.si/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer             (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        ordered-formatters (volatile! nil)
        rows!              (atom [])
        pivot-options      (atom nil)
        pivot-grouping-idx (volatile! nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows? pivot-export-options]
                   :or   {format-rows? true}} :data} viz-settings]
        (let [opts           (when (and *pivot-export-post-processing-enabled* pivot-export-options)
                               (assoc pivot-export-options :column-titles (mapv :display_name ordered-cols)))
              ;; col-names are created later when exporting a pivot table, so only create them if there are no pivot options
              col-names      (when-not opts (common/column-titles ordered-cols (::mb.viz/column-settings viz-settings) format-rows?))
              pivot-grouping (qp.pivot.postprocess/pivot-grouping-key col-names)]
          ;; when pivot options exist, we want to save them to access later when processing the complete set of results for export.
          (when pivot-grouping (vreset! pivot-grouping-idx pivot-grouping))
          (when opts
            (reset! pivot-options (merge {:pivot-rows []
                                          :pivot-cols []} opts)))
          (vreset! ordered-formatters
                   (if format-rows?
                     (mapv #(formatter/create-formatter results_timezone % viz-settings) ordered-cols)
                     (vec (repeat (count ordered-cols) identity))))
          ;; write the column names for non-pivot tables
          (when-not opts
            (let [modified-row (cond->> col-names
                                 @pivot-grouping-idx (m/remove-nth @pivot-grouping-idx))]
              (write-csv writer [modified-row]))
            (.flush writer))))

      (write-row! [_ row _row-num _ {:keys [output-order]}]
        (let [ordered-row (vec
                           (if output-order
                             (let [row-v (into [] row)]
                               (for [i output-order] (row-v i)))
                             row))
              xf-row      (perf/mapv (fn [formatter r]
                                       (formatter (common/format-value r)))
                                     @ordered-formatters ordered-row)]
          (if @pivot-options
            ;; if we're processing a pivot result, we don't write it out yet, just store it
            ;; so that we can post process the full set of results in finish!
            (swap! rows! conj xf-row)
            (let [pivot-grouping-key @pivot-grouping-idx
                  group              (get ordered-row pivot-grouping-key)
                  cleaned-row        (cond->> xf-row
                                       pivot-grouping-key (m/remove-nth pivot-grouping-key))]
              (when (or (= qp.pivot.postprocess/NON_PIVOT_ROW_GROUP group)
                        (not group))
                (write-csv writer [cleaned-row])
                (.flush writer))))))

      (finish! [_ _]
        ;; TODO -- not sure we need to flush both
        (when @pivot-options
          (let [pivot-table-rows (qp.pivot.postprocess/pivot-builder @rows! @pivot-options)]
            (doseq [xf-row pivot-table-rows]
              (write-csv writer [xf-row]))))
        (.flush writer)
        (.flush os)
        (.close writer)))))
