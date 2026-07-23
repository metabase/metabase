(ns metabase.mq.queue.impl
  "Queue-specific delivery policy — the queue counterpart to the transport-agnostic delivery core in [[metabase.mq.impl]]."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- run-on-error!
  "Invokes the queue's `:on-error` terminal-failure hook, if it declares one, for a batch that is
  about to be dropped. `payload` is the still-encoded batch.

  The hook is a place to *record* a terminal failure, not a veto over it, so a handler that throws is
  logged and the batch is dropped anyway. That log is worth keeping: a throwing handler means the row
  the producer parked in `pending` is now stranded, and this line is the only trace of why."
  [channel payload error attempts]
  (when-let [handler (q.registry/on-error channel)]
    (try
      (handler {:channel  channel
                :messages (payload/decode payload)
                :error    error
                :attempts attempts})
      (catch Throwable t
        (log/error t "Queue :on-error handler threw; still dropping the batch" {:channel channel})))))

(defn handle-batch-failure-policy!
  "Retry-vs-drop policy for a just-failed queue batch. `failures` is the number of attempts that have
  already failed, so the just-failed attempt makes `(inc failures)` total. `error` is the exception
  that failed the batch, carried through so the give-up is diagnosable. `payload` is the encoded
  batch, needed only to hand the messages to the queue's `:on-error` hook on the drop path.

  When `(inc failures)` reaches `queue-max-retries` the batch is dropped: the queue's `:on-error`
  hook (if any) runs first so the owner can record the terminal failure durably, then the drop is
  error-logged *with the cause* + `batches-dropped` `reason=delivery-exhausted` and `on-drop` is
  called. Otherwise `batches-retried` `reason=delivery` is emitted, a concise retry line is logged,
  and `on-retry` re-enqueues it."
  [channel payload failures error on-retry on-drop]
  (let [max-retries (mq.settings/queue-max-retries)
        attempts    (inc failures)]
    (if (>= attempts max-retries)
      (do
        (run-on-error! channel payload error attempts)
        (u/ignore-exceptions
          (log/error error "Dropping queue batch after exhausting retries"
                     {:channel channel :max-retries max-retries})
          (analytics/inc! :metabase-mq/batches-dropped
                          {:channel (name channel) :reason "delivery-exhausted"}))
        (on-drop))
      (do
        (u/ignore-exceptions
          (log/warnf "Queue batch for %s failed attempt %d of %d; will retry with backoff."
                     channel attempts max-retries)
          (analytics/inc! :metabase-mq/batches-retried
                          {:channel (name channel) :reason "delivery"}))
        (on-retry)))))
