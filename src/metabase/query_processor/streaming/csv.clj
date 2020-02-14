(ns metabase.query-processor.streaming.csv
  (:require [clojure.data.csv :as csv]
            [metabase.query-processor.streaming.interface :as i])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]))

(defmethod i/stream-options :csv
  [_]
  {:content-type              "text/csv"
   :write-keepalive-newlines? false})

(defmethod i/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer (BufferedWriter. (OutputStreamWriter. os))]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [cols]} :data}]
        (csv/write-csv writer [(map :display_name cols)])
        (.flush writer))

      (write-row! [_ row _]
        (csv/write-csv writer [row]))

      (finish! [_ _]
        (.close writer)
        (.close os)))))
