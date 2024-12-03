(ns metabase.query-processor.streaming.csv
  (:require
   [clojure.data.csv]
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.formatter :as formatter]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util :as u]
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

(defn- col->aggregation-fn-key
  [{agg-name :name source :source}]
  (when (= :aggregation source)
    (let [agg-name (u/lower-case-en agg-name)]
      (cond
        (str/starts-with? agg-name "sum")    :sum
        (str/starts-with? agg-name "avg")    :avg
        (str/starts-with? agg-name "min")    :min
        (str/starts-with? agg-name "max")    :max
        (str/starts-with? agg-name "count")  :count
        (str/starts-with? agg-name "stddev") :stddev))))

(defmethod qp.si/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer             (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        ordered-formatters (volatile! nil)
        pivot-data         (atom nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows? pivot-export-options pivot?]
                   :or   {format-rows? true
                          pivot?       false}} :data} viz-settings]
        (let [col-names          (vec (common/column-titles ordered-cols (::mb.viz/column-settings viz-settings) format-rows?))
              opts               (when (and pivot? pivot-export-options)
                                   (-> (merge {:pivot-rows []
                                               :pivot-cols []
                                               :measures   (mapv col->aggregation-fn-key ordered-cols)}
                                              pivot-export-options)
                                       (assoc :column-titles col-names)
                                       (qp.pivot.postprocess/add-totals-settings viz-settings)
                                       qp.pivot.postprocess/add-pivot-measures))
              pivot-grouping-key (qp.pivot.postprocess/pivot-grouping-key col-names)]

          ;; initialize the pivot-data
          ;; If exporting pivoted, init the pivot data structure
          ;; Otherwise, just store the pivot-grouping key index
          (when (and pivot? pivot-export-options)
            (reset! pivot-data (qp.pivot.postprocess/init-pivot opts)))
          (when pivot-grouping-key
            (swap! pivot-data assoc :pivot-grouping pivot-grouping-key))

          (vreset! ordered-formatters
                   (mapv #(formatter/create-formatter results_timezone % viz-settings format-rows?) ordered-cols))

          ;; write the column names for non-pivot tables
          (when (or (not opts) (not (public-settings/enable-pivoted-exports)))
            (let [header (m/remove-nth (or pivot-grouping-key (inc (count col-names))) col-names)]
              (write-csv writer [header])
              (.flush writer)))))

      (write-row! [_ row _row-num _ {:keys [output-order]}]
        (let [ordered-row              (if output-order
                                         (let [row-v (into [] row)]
                                           (into [] (for [i output-order] (row-v i))))
                                         row)
              {:keys [pivot-grouping]} (or (:config @pivot-data) @pivot-data)
              group                    (get ordered-row pivot-grouping)]
          (if (and (contains? @pivot-data :config) (public-settings/enable-pivoted-exports))
            ;; if we're processing a pivot result, we don't write it out yet, just aggregate it
            ;; so that we can post process the data in finish!
            (when (= qp.pivot.postprocess/NON_PIVOT_ROW_GROUP (int group))
              (swap! pivot-data (fn [pivot-data] (qp.pivot.postprocess/add-row pivot-data ordered-row))))

            (if group
              (when (= qp.pivot.postprocess/NON_PIVOT_ROW_GROUP (int group))
                (let [formatted-row (->> (perf/mapv (fn [formatter r]
                                                      (formatter (common/format-value r)))
                                                    @ordered-formatters ordered-row)
                                         (m/remove-nth pivot-grouping))]
                  (write-csv writer [formatted-row])
                  (.flush writer)))
              (let [formatted-row (perf/mapv (fn [formatter r]
                                               (formatter (common/format-value r)))
                                             @ordered-formatters ordered-row)]
                (write-csv writer [formatted-row])
                (.flush writer))))))

      (finish! [_ _]
        ;; TODO -- not sure we need to flush both
        (when (and (contains? @pivot-data :config) (public-settings/enable-pivoted-exports))
          (doseq [xf-row (qp.pivot.postprocess/build-pivot-output @pivot-data @ordered-formatters)]
            (write-csv writer [xf-row])))
        (.flush writer)
        (.flush os)
        (.close writer)))))
