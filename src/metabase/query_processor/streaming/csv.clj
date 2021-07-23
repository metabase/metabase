(ns metabase.query-processor.streaming.csv
  (:require [clojure.data.csv :as csv]
            [java-time :as t]
            [metabase.query-processor.streaming.common :as common]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.util.date-2 :as u.date])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets))

(defmethod i/stream-options :csv
  [_]
  {:content-type              "text/csv"
   :status                    200
   :headers                   {"Content-Disposition" (format "attachment; filename=\"query_result_%s.csv\""
                                                             (u.date/format (t/zoned-date-time)))}
   :write-keepalive-newlines? false})

(defn- select-indices
  [data indices]
  (if indices
    (let [data-vec (into [] data)]
      (for [i indices] (data-vec i)))
    data))

(defmethod i/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [deduped-cols]} :data} {:keys [output-order]}]
        (let [ordered-cols (select-indices deduped-cols output-order)]
          (csv/write-csv writer [(map (some-fn :display_name :name) ordered-cols)])
          (.flush writer)))

      (write-row! [_ row row-num {:keys [output-order]}]
        (let [ordered-row (select-indices row output-order)]
          (csv/write-csv writer [(map common/format-value ordered-row)])
          (.flush writer)))

      (finish! [_ _]
         ;; TODO -- not sure we need to flush both
        (.flush writer)
        (.flush os)
        (.close writer)))))
