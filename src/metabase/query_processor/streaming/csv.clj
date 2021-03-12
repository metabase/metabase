(ns metabase.query-processor.streaming.csv
  (:require [clojure.data.csv :as csv]
            [java-time :as t]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.util.date-2 :as u.date]
            [metabase.util.visualization-settings :as viz])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets))

(defmethod i/stream-options :csv
  [_]
  {:content-type              "text/csv"
   :status                    200
   :headers                   {"Content-Disposition" (format "attachment; filename=\"query_result_%s.csv\""
                                                             (u.date/format (t/zoned-date-time)))}
   :write-keepalive-newlines? false})

(defmethod i/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [cols indexed-column-title-overrides]} :data}]
        (letfn [(col-nm-fn [idx col]
                  (if-some [col-title (nth indexed-column-title-overrides idx)]
                    col-title
                    ((some-fn :display_name :name) col)))]
          (csv/write-csv writer [(map-indexed col-nm-fn cols)]))
        (.flush writer))

      (write-row! [_ row _ {{:keys [cols indexed-column-viz-settings]} :data}]
        (letfn [(fmt-row [idx val]
                  (let [fmt-fn (::viz/format-fn (nth indexed-column-viz-settings idx))]
                    (fmt-fn val)))]
          (csv/write-csv writer [(map-indexed fmt-row row)])
          (.flush writer)))

      (finish! [_ _]
         ;; TODO -- not sure we need to flush both
        (.flush writer)
        (.flush os)
        (.close writer)))))
