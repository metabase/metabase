(ns metabase.query-processor.streaming
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [metabase.async
             [streaming-response :as streaming-response]
             [util :as async.u]]
            [metabase.query-processor.context :as context])
  (:import java.io.Writer))

(defn- write-beginning! [^Writer writer]
  (.write writer "{\"data\":{\"rows\":[\n"))

(defn- write-row! [^Writer writer row first-row?]
  (when-not first-row?
    (.write writer ",\n"))
  (json/generate-stream row writer)
  (.flush writer))

(defn- map->serialized-json-kvs
  "{:a 100, :b 200} ; -> \"a\":100,\"b\":200"
  ^String [m]
  (when (seq m)
    (let [s (json/generate-string m)]
      (.substring s 1 (dec (count s))))))

(defn- write-metadata! [^Writer writer {:keys [data], :as metadata}]
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
    (.write writer "}")
    (.flush writer)))

(defn- streaming-json-rff [writer]
  {:pre [(instance? Writer writer)]}
  (fn [metadata]
    (let [row-count (volatile! 0)]
      (fn
        ([]
         (write-beginning! writer)
         {:data metadata})

        ([metadata]
         (assoc metadata
                :row_count @row-count
                :status :completed))

        ([metadata row]
         (let [first-row? (= 1 (vswap! row-count inc))]
           (write-row! writer row first-row?))
         metadata)))))

(defn- streaming-json-reducedf [writer]
  {:pre [(instance? Writer writer)]}
  (fn [_ metadata context]
    (write-metadata! writer metadata)
    (.close writer)
    (context/resultf metadata context)))

;; TODO -- consider whether it makes sense to begin writing keepalive chars right away or if maybe we should wait to
;; call `respond` in async endpoints for 30-60 seconds that way we're not wasting a Ring thread right away
(defn do-streaming-response
  "Impl for `streaming-response`."
  ^metabase.async.streaming_response.StreamingResponse [run-query-with-context]
  (streaming-response/streaming-response [writer canceled-chan]
    (let [out-chan (run-query-with-context {:rff      (streaming-json-rff writer)
                                            :reducedf (streaming-json-reducedf writer)})]
      (assert (async.u/promise-chan? out-chan)
        "The body of streaming-response should return a core.async promise chan (use an async QP fn).")
      (a/go
        (let [[val port] (a/alts! [out-chan canceled-chan] :priority true)]
          (cond
            (and (= port out-chan)
                 (instance? Throwable val))
            (streaming-response/write-error-and-close! writer val)

            (and (= port canceled-chan)
                 (nil? val))
            (a/close! out-chan))))
      nil)))

(defmacro streaming-response
  "Return results of
    (api/defendpoint GET \"/whatever\" []
      (streaming-response [context]
        (qp/process-query-async my-query context)))"
  {:style/indent 1}
  [[context-binding :as bindings] & body]
  {:pre [(= (count bindings) 1)]}
  `(do-streaming-response (fn [~context-binding] ~@body)))
