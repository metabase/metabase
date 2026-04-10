(ns metabase.query-processor.streaming.batch-ndjson
  "Streaming results writer used by the dashboard batch endpoint. Unlike the single-card streaming
  writers, this writer does NOT own the output stream — multiple instances (one per card) share a
  single output stream owned by the batch orchestrator. Messages are encoded to `byte[]` and pushed
  onto a shared `BlockingQueue` so that exactly one writer thread touches the socket, flushing only
  on boundary markers (`card-begin`, `card-end`, `card-error`, `complete`).

  Row messages are chunked (see [[chunk-size]]) to amortize encoding/queue cost and bound per-worker
  heap to a small constant."
  (:require
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util.json :as json])
  (:import
   (java.nio.charset StandardCharsets)
   (java.util.concurrent BlockingQueue)))

(set! *warn-on-reflection* true)

(def ^:private chunk-size
  "Maximum rows buffered per `card-rows` message before it is flushed onto the queue. Trades off
  queue pressure / encode overhead against per-worker transient heap."
  100)

(def ^:private ^"[B" newline-bytes
  (.getBytes "\n" StandardCharsets/UTF_8))

(defn- encode-line ^bytes [m]
  (let [^bytes json-bs (.getBytes ^String (json/encode m) StandardCharsets/UTF_8)
        out            (byte-array (inc (alength json-bs)))]
    (System/arraycopy json-bs 0 out 0 (alength json-bs))
    (aset-byte out (alength json-bs) (aget newline-bytes 0))
    out))

(defn- enqueue!
  [^BlockingQueue queue ^bytes bs flush?]
  (.put queue {:bytes bs :flush? flush?}))

(defn- strip-rows
  "Remove :rows from a (nested or top-level) data map. Rows arrive via `card-rows` messages."
  [data]
  (dissoc data :rows))

(defn- flush-rows-buffer!
  [^BlockingQueue queue dashcard-id card-id rows-buf]
  (let [rows @rows-buf]
    (when (seq rows)
      (vreset! rows-buf [])
      (enqueue! queue
                (encode-line {:type        "card-rows"
                              :dashcard_id dashcard-id
                              :card_id     card-id
                              :rows        rows})
                false))))

(defrecord BatchCardNdjsonWriter [^BlockingQueue queue dashcard-id card-id rows-buf]
  qp.si/StreamingResultsWriter
  (begin! [_ initial-metadata _viz-settings]
    ;; Send everything we know about the result so far, minus rows (which stream separately).
    ;; `initial-metadata` is `{:data {...}}` at this point.
    (enqueue! queue
              (encode-line {:type        "card-begin"
                            :dashcard_id dashcard-id
                            :card_id     card-id
                            :data        (strip-rows (:data initial-metadata))})
              true))

  (write-row! [_ row _row-num _cols _viz-settings]
    ;; Raw rows like the `:api` writer — the frontend receives cols in `card-begin` metadata.
    (vswap! rows-buf conj (vec row))
    (when (>= (count @rows-buf) chunk-size)
      (flush-rows-buffer! queue dashcard-id card-id rows-buf)))

  (finish! [_ final-metadata]
    (flush-rows-buffer! queue dashcard-id card-id rows-buf)
    ;; `final-metadata` is the full QP result map (row_count, running_time, status, data, ...).
    ;; We ship it wholesale with rows stripped so the frontend can merge begin + end into a
    ;; complete Dataset.
    (enqueue! queue
              (encode-line (-> final-metadata
                               (update :data strip-rows)
                               (assoc :type        "card-end"
                                      :dashcard_id dashcard-id
                                      :card_id     card-id)))
              true)))

(defn batch-card-writer
  "Construct a per-card writer that emits `card-begin`/`card-rows`/`card-end` messages onto the
  shared `queue`. Does not close the underlying output stream — the batch orchestrator owns it."
  [^BlockingQueue queue dashcard-id card-id]
  (->BatchCardNdjsonWriter queue dashcard-id card-id (volatile! [])))

(defn emit-card-error!
  "Encode a `card-error` message for `(dashcard-id, card-id)` and enqueue it with flush.
  Safe to call without a writer instance — used for pre-card validation failures, mid-stream
  `:failed` results, and worker-level exception catches."
  [^BlockingQueue queue dashcard-id card-id error]
  (enqueue! queue
            (encode-line {:type        "card-error"
                          :dashcard_id dashcard-id
                          :card_id     card-id
                          :error       error})
            true))

(defn emit-complete!
  "Encode the final `complete` sentinel and enqueue it with flush."
  [^BlockingQueue queue summary]
  (enqueue! queue
            (encode-line (assoc summary :type "complete"))
            true))
