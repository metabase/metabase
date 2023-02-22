(ns metabase.query-processor.streaming.json
  "Impls for JSON-based QP streaming response types. `:json` streams a simple array of maps as opposed to the full
  response with all the metadata for `:api`."
  (:require
   [cheshire.core :as json]
   [java-time :as t]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util.date-2 :as u.date])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defmethod qp.si/stream-options :json
  ([_]
   (qp.si/stream-options :json "query_result"))
  ([_ filename-prefix]
   {:content-type "application/json; charset=utf-8"
    :status       200
    :headers      {"Content-Disposition" (format "attachment; filename=\"%s_%s.json\""
                                                 (or filename-prefix "query_result")
                                                 (u.date/format (t/zoned-date-time)))}}))

(defmethod qp.si/streaming-results-writer :json
  [_ ^OutputStream os]
  (let [writer    (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        col-names (volatile! nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols]} :data} _]
        ;; TODO -- wouldn't it make more sense if the JSON downloads used `:name` preferentially? Seeing how JSON is
        ;; probably going to be parsed programatically
        (vreset! col-names (mapv (some-fn :display_name :name) ordered-cols))
        (.write writer "[\n"))

      (write-row! [_ row row-num _ {:keys [output-order]}]
        (let [ordered-row (if output-order
                            (let [row-v (into [] row)]
                              (for [i output-order] (row-v i)))
                            row)]
          (when-not (zero? row-num)
            (.write writer ",\n"))
          (json/generate-stream (zipmap @col-names (map common/format-value ordered-row))
                                writer)
          (.flush writer)))

      (finish! [_ _]
        (.write writer "\n]")
        (.flush writer)
        (.flush os)
        (.close writer)))))

(defmethod qp.si/stream-options :api
  ([_]   (qp.si/stream-options :api nil))
  ([_ _] {:content-type "application/json; charset=utf-8"}))

(defn- map->serialized-json-kvs
  "{:a 100, :b 200} ; -> \"a\":100,\"b\":200"
  ^String [m]
  (when (seq m)
    (let [s (json/generate-string m)]
      (.substring s 1 (dec (count s))))))

(defmethod qp.si/streaming-results-writer :api
  [_ ^OutputStream os]
  (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ _ _]
        (.write writer "{\"data\":{\"rows\":[\n"))

      (write-row! [_ row row-num _ _]
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
