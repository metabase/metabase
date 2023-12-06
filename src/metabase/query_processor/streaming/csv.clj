(ns metabase.query-processor.streaming.csv
  (:require
   [clojure.data.csv :as csv]
   [java-time.api :as t]
    #_{:clj-kondo/ignore [:consistent-alias]}
   [metabase.pulse.render.common :as p.common]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
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

(defmethod qp.si/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer             (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        ordered-formatters (atom {})]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone]} :data} viz-settings]
        (swap! ordered-formatters (constantly
                                    (mapv (fn [col]
                                            (p.common/get-format results_timezone col viz-settings))
                                          ordered-cols)))
        (csv/write-csv writer [(map (some-fn :display_name :name) ordered-cols)])
        (.flush writer))

      (write-row! [_ row _row-num _ {:keys [output-order]}]
        (let [ordered-row (if output-order
                            (let [row-v (into [] row)]
                              (for [i output-order] (row-v i)))
                            row)]
          (csv/write-csv writer [(map (fn [formatter r]
                                        (formatter (common/format-value r)))
                                      @ordered-formatters ordered-row)])
          (.flush writer)))

      (finish! [_ _]
        ;; TODO -- not sure we need to flush both
        (.flush writer)
        (.flush os)
        (.close writer)))))
