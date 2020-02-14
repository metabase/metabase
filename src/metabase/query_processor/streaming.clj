(ns metabase.query-processor.streaming
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [metabase.async
             [streaming-response :as streaming-response]
             [util :as async.u]]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.streaming csv json xlsx
             [interface :as i]]
            [metabase.util :as u])
  (:import [java.io BufferedWriter OutputStreamWriter]))

;; these are loaded for side-effects so their impls of `i/results-writer` will be available
(comment metabase.query-processor.streaming.csv/keep-me
         metabase.query-processor.streaming.json/keep-me
         metabase.query-processor.streaming.xlsx/keep-me)

(defn- streaming-rff [results-writer]
  (fn [initial-metadata]
    (let [row-count (volatile! 0)]
      (fn
        ([]
         (u/prog1 {:data initial-metadata}
           (i/begin! results-writer <>)))

        ([metadata]
         (assoc metadata
                :row_count @row-count
                :status :completed))

        ([metadata row]
         (i/write-row! results-writer row (dec (vswap! row-count inc)))
         metadata)))))

(defn- streaming-reducedf [results-writer]
  (fn [_ final-metadata context]
    (i/finish! results-writer final-metadata)
    (context/resultf final-metadata context)))

;; TODO -- consider whether it makes sense to begin writing keepalive chars right away or if maybe we should wait to
;; call `respond` in async endpoints for 30-60 seconds that way we're not wasting a Ring thread right away
(defn do-streaming-response
  "Impl for `streaming-response`."
  ^metabase.async.streaming_response.StreamingResponse [stream-type run-query-fn]
  (streaming-response/streaming-response (i/stream-options stream-type) [os canceled-chan]
    (let [results-writer (i/streaming-results-writer stream-type os)
          out-chan       (run-query-fn {:rff      (streaming-rff results-writer)
                                        :reducedf (streaming-reducedf results-writer)})]
      (if (async.u/promise-chan? out-chan)
        (a/go
          (let [[val port] (a/alts! [out-chan canceled-chan] :priority true)]
            (cond
              (and (= port out-chan)
                   (instance? Throwable val))
              (streaming-response/write-error-and-close! os val)

              (and (= port canceled-chan)
                   (nil? val))
              (a/close! out-chan))))
        ;; if we got something besides a channel?
        (do
          (with-open [writer (BufferedWriter. (OutputStreamWriter. os))]
            (json/generate-stream out-chan writer))
          (.close os)))
      nil)))

(defmacro streaming-response
  "Return results of processing a query as a streaming response. This response implements the appropriate Ring/Compojure
  protocols, so return or `respond` with it directly. Pass the provided `context` to your query processor function of
  choice. `stream-type` is one of `:api` (for normal JSON API responses), `:json`, `:csv`, or `:xlsx` (for downloads).

  Typical example:

    (api/defendpoint GET \"/whatever\" []
      (qp.streaming/streaming-response [context :json]
        (qp/process-query-and-save-with-max-results-constraints! (assoc my-query :async? true) context)))"
  {:style/indent 1}
  [[context-binding stream-type] & body]
  `(do-streaming-response ~stream-type (fn [~context-binding] ~@body)))

(defn stream-types
  "Set of valid streaming response formats. Currently, `:json`, `:csv`, `:xlsx`, and `:api` (normal JSON API results
  with extra metadata), but other types may be available if plugins are installed. (The interface is extensible.)"
  []
  (set (keys (methods i/stream-options))))
