(ns metabase.query-processor.streaming
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [metabase.async
             [streaming-response :as streaming-response]
             [util :as async.u]]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.streaming
             [csv :as streaming.csv]
             [interface :as i]
             [json :as streaming.json]
             [xlsx :as streaming.xlsx]]
            [metabase.util :as u])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]
           org.eclipse.jetty.io.EofException))

;; these are loaded for side-effects so their impls of `i/results-writer` will be available
(comment streaming.csv/keep-me
         streaming.json/keep-me
         streaming.xlsx/keep-me)

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

(defn- write-qp-failure-and-close! [^OutputStream os result]
  (with-open [writer (BufferedWriter. (OutputStreamWriter. os))]
    (try
      (json/generate-stream result writer)
      (catch EofException _)))
  (.close os))

(defn streaming-context
  "Context to pass to the QP to streaming results as `export-format` to an output stream. Can be used independently of
  the normal `streaming-response` macro, which is geared toward Ring responses.

    (with-open [os ...]
      (qp/process-query query (qp.streaming/streaming-context :csv os)))"
  [export-format ^OutputStream os]
  (let [results-writer (i/streaming-results-writer export-format os)]
    {:rff      (streaming-rff results-writer)
     :reducedf (streaming-reducedf results-writer)}))

;; TODO -- consider whether it makes sense to begin writing keepalive chars right away or if maybe we should wait to
;; call `respond` in async endpoints for 30-60 seconds that way we're not wasting a Ring thread right away
(defn do-streaming-response
  "Impl for `streaming-response`."
  ^metabase.async.streaming_response.StreamingResponse [export-format run-query-fn]
  (streaming-response/streaming-response (i/stream-options export-format) [os canceled-chan]
    (let [out-chan (try
                     (run-query-fn (streaming-context export-format os))
                     (catch Throwable e
                       e))]
      (if (async.u/promise-chan? out-chan)
        (a/go
          (let [[val port] (a/alts! [out-chan canceled-chan] :priority true)]
            (cond
              ;; if result is an Exception or a QP failure response write that out (async) and close up
              (and (= port out-chan)
                   (instance? Throwable val))
              (a/thread (streaming-response/write-error-and-close! os val))

              (and (= port out-chan)
                   (map? val)
                   (= (:status val) :failed))
              (a/thread (write-qp-failure-and-close! os val))

              ;; otherwise if the `cancled-chan` go a message we can tell the QP to cancel the running query by
              ;; closing `out-chan`
              (and (= port canceled-chan)
                   (nil? val))
              (a/close! out-chan))))
        ;; if we got something besides a channel, such as a Throwable, write it as JSON to the `out-chan` and close
        (a/thread
          (if (instance? Throwable out-chan)
            (streaming-response/write-error-and-close! os out-chan)
            (write-qp-failure-and-close! os out-chan))))
      nil)))

(defmacro streaming-response
  "Return results of processing a query as a streaming response. This response implements the appropriate Ring/Compojure
  protocols, so return or `respond` with it directly. Pass the provided `context` to your query processor function of
  choice. `export-format` is one of `:api` (for normal JSON API responses), `:json`, `:csv`, or `:xlsx` (for downloads).

  Typical example:

    (api/defendpoint GET \"/whatever\" []
      (qp.streaming/streaming-response [context :json]
        (qp/process-query-and-save-with-max-results-constraints! (assoc my-query :async? true) context)))"
  {:style/indent 1}
  [[context-binding export-format :as bindings] & body]
  {:pre [(vector? bindings) (= (count bindings) 2)]}
  `(do-streaming-response ~export-format (fn [~context-binding] ~@body)))

(defn export-formats
  "Set of valid streaming response formats. Currently, `:json`, `:csv`, `:xlsx`, and `:api` (normal JSON API results
  with extra metadata), but other types may be available if plugins are installed. (The interface is extensible.)"
  []
  (set (keys (methods i/stream-options))))

(defn ^:deprecated stream-api-results-to-export-format
  "For legacy compatability. Takes QP results in the normal `:api` response format and streams them to a different
  format.

  TODO -- this function is provided mainly because rewriting all of the Pulse/Alert code to stream results directly
  was a lot of work. I intend to rework that code so we can stream directly to the correct export format(s) at some
  point in the future; for now, this function is a stopgap.

  Results are streamed synchronosuly. Caller is responsible for closing `os` when this call is complete."
  [export-format ^OutputStream os {{:keys [rows]} :data, :as results}]
  (let [w (i/streaming-results-writer export-format os)]
    (i/begin! w results)
    (dorun
     (map-indexed
      (fn [i row]
        (i/write-row! w row i))
      rows))
    (i/finish! w results)))
