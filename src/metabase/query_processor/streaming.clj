(ns metabase.query-processor.streaming
  (:require [clojure.core.async :as a]
            [metabase.async
             [streaming-response :as streaming-response]
             [util :as async.u]]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.streaming
             [interface :as i]
             [json :as streaming.json]]
            [metabase.util.i18n :refer [tru]]))

;; these are loaded for side-effects so their impls of `i/results-writer` will be available
(comment metabase.query-processor.streaming.json/keep-me)

(defn- streaming-rff [results-writer]
  (fn [initial-metadata]
    (i/begin! results-writer initial-metadata)
    (let [row-count (volatile! 0)]
      (fn
        ([]
         {:data initial-metadata})

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
  (assert (get-method i/streaming-results-writer (keyword stream-type))
          (tru "Invalid streaming results type {0}" stream-type))
  (streaming-response/streaming-response [writer canceled-chan]
    (let [results-writer (i/streaming-results-writer stream-type writer)
          out-chan       (run-query-fn {:rff      (streaming-rff results-writer)
                                        :reducedf (streaming-reducedf results-writer)})]
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
      (streaming-response [context :json]
        (qp/process-query-async my-query context)))"
  {:style/indent 1}
  [[context-binding stream-type] & body]
  `(do-streaming-response ~stream-type (fn [~context-binding] ~@body)))
