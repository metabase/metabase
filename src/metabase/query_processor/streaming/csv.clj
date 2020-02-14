(ns metabase.query-processor.streaming.csv
  (:require [clojure.data.csv :as csv]
            [java-time :as t]
            [metabase.query-processor.streaming
             [common :as common]
             [interface :as i]]
            [metabase.util.date-2 :as u.date])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]))

(defmethod i/stream-options :csv
  [_]
  {:content-type              "text/csv"
   :headers                   {"Content-Disposition" (format "attachment; filename=\"query_result_%s.csv\""
                                                             (u.date/format (t/zoned-date-time)))}
   :write-keepalive-newlines? false})

(defmethod i/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer (BufferedWriter. (OutputStreamWriter. os))]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [cols]} :data}]
        (csv/write-csv writer [(map :display_name cols)])
        (.flush writer))

      (write-row! [_ row _]
        (csv/write-csv writer [(map common/format-value row)]))

      (finish! [_ _]
        (.close writer)
        (.close os)))))
