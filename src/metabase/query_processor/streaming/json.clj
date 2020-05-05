(ns metabase.query-processor.streaming.json
  "Impls for JSON-based QP streaming response types. `:json` streams a simple array of maps as opposed to the full
  response with all the metadata for `:api`."
  (:require [cheshire.core :as json]
            [java-time :as t]
            [metabase.query-processor.streaming
             [common :as common]
             [interface :as i]]
            [metabase.util.date-2 :as u.date])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets))

(defmethod i/stream-options :json
  [_]
  {:content-type "application/json; charset=utf-8"
   :headers      {"Content-Disposition" (format "attachment; filename=\"query_result_%s.json\""
                                                (u.date/format (t/zoned-date-time)))}})

(defmethod i/streaming-results-writer :json
  [_ ^OutputStream os]
  (let [writer    (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        col-names (volatile! nil)]
    (reify i/StreamingResultsWriter
      (begin! [_ {{:keys [cols]} :data}]
        (vreset! col-names (mapv (some-fn :display_name :name) cols))
        (.write writer "[\n"))

      (write-row! [_ row row-num]
        (when-not (zero? row-num)
          (.write writer ",\n"))
        (json/generate-stream (zipmap @col-names (map common/format-value row))
                              writer)
        (.flush writer))

      (finish! [_ _]
        (.write writer "\n]")
        (.flush writer)
        (.flush os)
        (.close writer)))))

(defmethod i/stream-options :api
  [stream-type]
  {:content-type "application/json; charset=utf-8"})

(defn- map->serialized-json-kvs
  "{:a 100, :b 200} ; -> \"a\":100,\"b\":200"
  ^String [m]
  (when (seq m)
    (let [s (json/generate-string m)]
      (.substring s 1 (dec (count s))))))

(defmethod i/streaming-results-writer :api
  [_ ^OutputStream os]
  (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
    (reify i/StreamingResultsWriter
      (begin! [_ _]
        (.write writer "{\"data\":{\"rows\":[\n"))

      (write-row! [_ row row-num]
        (when-not (zero? row-num)
          (.write writer ",\n"))
        (json/generate-stream row writer)
        (.flush writer))

      (finish! [_ {:keys [data], :as metadata}]
        (let [data-kvs-str           (map->serialized-json-kvs data)
              other-metadata-kvs-str (map->serialized-json-kvs (dissoc metadata :data))]
          ;; close data.rows
          (.write writer "\n]")
          ;; write any remaining keys in data
          (when (seq data-kvs-str)
            (.write writer ",\n")
            (.write writer data-kvs-str))
          ;; close data
          (.write writer "}")
          ;; write any remaining top-level keys
          (when (seq other-metadata-kvs-str)
            (.write writer ",\n")
            (.write writer other-metadata-kvs-str))
          ;; close top-level map
          (.write writer "}"))
        (.flush writer)
        (.flush os)
        (.close writer)))))
