(ns metabase.query-processor.streaming.csv
  (:require
   [clojure.data.csv :as csv]
   [java-time.api :as t]
   [metabase.formatter :as formatter]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util.date-2 :as u.date])
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

(defmethod qp.si/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer             (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        ordered-formatters (volatile! nil)
        pivot-data         (atom nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows? pivot-export-options]
                   :or   {format-rows? true}} :data} viz-settings]
        (let [opts      (when (and *pivot-export-post-processing-enabled* pivot-export-options)
                          (-> (merge {:pivot-rows []
                                      :pivot-cols []}
                                     pivot-export-options)
                              (assoc :column-titles (mapv :display_name ordered-cols))
                              qp.pivot.postprocess/add-pivot-measures))
              ;; col-names are created later when exporting a pivot table, so only create them if there are no pivot options
              col-names (when-not opts (common/column-titles ordered-cols (::mb.viz/column-settings viz-settings) format-rows?))]

          ;; when pivot options exist, we want to save them to access later when processing the complete set of results for export.
          (when opts
            (reset! pivot-data (qp.pivot.postprocess/init-pivot opts)))
          (vreset! ordered-formatters
                   (if format-rows?
                     (mapv #(formatter/create-formatter results_timezone % viz-settings) ordered-cols)
                     (vec (repeat (count ordered-cols) identity))))
          ;; write the column names for non-pivot tables
          (when col-names
            (csv/write-csv writer [col-names])
            (.flush writer))))

      (write-row! [_ row _row-num _ {:keys [output-order]}]
        (let [ordered-row (if output-order
                            (let [row-v (into [] row)]
                              (into [] (for [i output-order] (row-v i))))
                            row)]
          (if @pivot-data
            ;; if we're processing a pivot result, we don't write it out yet, just aggregate it
            ;; so that we can post process the data in finish!
            (when (= 0 (nth ordered-row (get-in @pivot-data [:config :pivot-grouping])))
              (swap! pivot-data (fn [a] (qp.pivot.postprocess/add-row a ordered-row))))
            (let [formatted-row (mapv (fn [formatter r]
                                        (formatter (common/format-value r)))
                                      @ordered-formatters ordered-row)]
              (csv/write-csv writer [formatted-row])
              (.flush writer)))))

      (finish! [_ _]
        ;; TODO -- not sure we need to flush both
        (when @pivot-data
          (doseq [xf-row (qp.pivot.postprocess/build-pivot-output @pivot-data @ordered-formatters)]
            (csv/write-csv writer [xf-row])))
        (.flush writer)
        (.flush os)
        (.close writer)))))
