(ns metabase.query-processor.streaming.csv
  (:require
   [clojure.data.csv]
   [medley.core :as m]
   [metabase.formatter :as formatter]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.query-processor.streaming.interface :as qp.si]
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
                                                              (streaming.common/export-filename-timestamp))}
    :write-keepalive-newlines? false}))

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
        pivot-data         (atom nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows? pivot-export-options pivot?]
                   :or   {format-rows? true
                          pivot?       false}} :data} viz-settings]
        (let [col-names          (vec (streaming.common/column-titles ordered-cols (::mb.viz/column-settings viz-settings) format-rows?))
              pivot-grouping-key (qp.pivot.postprocess/pivot-grouping-key col-names)]
          (cond
            (and pivot? pivot-export-options)
            (reset! pivot-data
                    {:settings viz-settings
                     :data {:cols ordered-cols
                            :rows []}
                     :timezone results_timezone
                     :format-rows? format-rows?
                     :pivot-grouping-key pivot-grouping-key})
            ;; Non-pivoted export of pivot table: sore the pivot-grouping-key so that the pivot group can be
            ;; removed from the exported data
            pivot-export-options
            (reset! pivot-data {:pivot-grouping-key pivot-grouping-key}))

          (vreset! ordered-formatters
                   (mapv #(formatter/create-formatter results_timezone % viz-settings format-rows?) ordered-cols))

          ;; write the column names for non-pivot tables
          (when (or (not pivot?) (not (public-settings/enable-pivoted-exports)))
            (let [header (m/remove-nth (or pivot-grouping-key (inc (count col-names))) col-names)]
              (write-csv writer [header])
              (.flush writer)))))

      (write-row! [_ row _row-num _ {:keys [output-order]}]
        (let [ordered-row (if output-order
                            (let [row-v (into [] row)]
                              (into [] (for [i output-order] (row-v i))))
                            row)
              {:keys [pivot-grouping-key]} @pivot-data
              group                    (get ordered-row pivot-grouping-key)]
          (if (and (contains? @pivot-data :data) (public-settings/enable-pivoted-exports))
            (swap! pivot-data (fn [pivot-data] (update-in pivot-data [:data :rows] conj ordered-row)))
            (if group
              (when (= qp.pivot.postprocess/NON_PIVOT_ROW_GROUP (int group))
                (let [formatted-row (->> (perf/mapv (fn [formatter r]
                                                      (formatter (streaming.common/format-value r)))
                                                    @ordered-formatters ordered-row)
                                         (m/remove-nth pivot-grouping-key))]
                  (write-csv writer [formatted-row])
                  (.flush writer)))
              (let [formatted-row (perf/mapv (fn [formatter r]
                                               (formatter (streaming.common/format-value r)))
                                             @ordered-formatters ordered-row)]
                (write-csv writer [formatted-row])
                (.flush writer))))))

      (finish! [_ _]
        ;; TODO -- not sure we need to flush both
        (when (and (contains? @pivot-data :data) (public-settings/enable-pivoted-exports))
          (let [output (qp.pivot.postprocess/build-pivot-output @pivot-data)]
            (doseq [xf-row output]
              (write-csv writer [xf-row]))))
        (.flush writer)
        (.flush os)
        (.close writer)))))
