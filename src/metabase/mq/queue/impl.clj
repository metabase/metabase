(ns metabase.mq.queue.impl
  "Queue-specific delivery policy — the queue counterpart to the transport-agnostic delivery core in [[metabase.mq.impl]]."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn handle-batch-failure-policy!
  "Retry-vs-drop policy for a just-failed queue batch. `failures` is the number of attempts that have
  already failed, so the just-failed attempt makes `(inc failures)` total. `error` is the exception
  that failed the batch, carried through so the give-up is diagnosable. When `(inc failures)` reaches
  `queue-max-retries` the batch is dropped (error-logged *with the cause* + `batches-dropped`
  `reason=delivery-exhausted`) by calling `on-drop`; otherwise `batches-retried` `reason=delivery` is
  emitted, a concise retry line is logged, and `on-retry` re-enqueues it."
  [channel failures error on-retry on-drop]
  (let [max-retries (mq.settings/queue-max-retries)]
    (if (>= (inc failures) max-retries)
      (do
        (log/error error "Dropping queue batch after exhausting retries"
                   {:channel channel :max-retries max-retries})
        (analytics/inc! :metabase-mq/batches-dropped {:channel (name channel) :reason "delivery-exhausted"})
        (on-drop))
      (do
        (log/warnf "Queue batch for %s failed attempt %d of %d; will retry with backoff."
                   channel (inc failures) max-retries)
        (analytics/inc! :metabase-mq/batches-retried {:channel (name channel) :reason "delivery"})
        (on-retry)))))
