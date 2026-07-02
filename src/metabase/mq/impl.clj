(ns metabase.mq.impl
  "Backend-agnostic message delivery, shared by every queue backend.

  The single entry point is [[deliver!]]: decode an opaque payload, resolve the channel's listener,
  run it with batch-slicing + per-chunk error isolation + metrics, and return a *normalized result*
  the calling backend interprets. It never acks, nacks, reschedules, or otherwise touches backend
  state, so poll and push backends share it verbatim."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.listener :as listener]
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ Activity tracking ------------------------------------------

(def ^:private last-activity*
  "channel keyword → nanoTime of last publish or handler completion."
  (atom {}))

(defn last-activity
  "Returns the nanoTime of the last publish or handler completion for the given channel, or nil."
  [channel]
  (get @last-activity* channel))

(defn record-publish-activity!
  "Records a publish event for the given channel. Called by the publishing pipeline."
  [channel]
  (swap! last-activity* assoc channel (System/nanoTime)))

;;; --------------------------------------- Normalized deliver! results ---------------------------------------

(def no-listener
  "Marker [[deliver!]] returns when `channel` has no listener running on this node. Push backends
  (e.g. Quartz) treat it as 'defer to a node that has a listener' rather than a delivered/dropped
  message; poll backends leave the batch for the stale-recovery sweep. The message must not be
  consumed here."
  ::no-listener)

(def undecodable
  "Marker [[deliver!]] returns when a payload can't be decoded — corrupt or incompatible, so no node
  can ever deliver it. Already metered as `batches-dropped{reason=undecodable}`, so callers just drop
  the message (a poll backend acks the stored batch; a push backend completes the trigger)."
  ::undecodable)

;;; ------------------------------------------- Delivery core -------------------------------------------

(defn- invoke-listener!
  "Common listener invocation skeleton.
  Looks up listener via `listener-fn`, times execution, logs errors,
  and records metrics. Calls `on-success` / `on-error` for queue ACK/NACK."
  [{:keys [channel listener-fn invoke-fn on-success on-error]}]
  (let [transport (namespace channel)
        listener  (listener-fn)
        labels    {:transport transport :channel (name channel)}
        start     (System/nanoTime)]
    (try
      (if-not listener
        (log/debugf "No listener registered for %s %s, skipping message" transport (name channel))
        (do
          (invoke-fn listener)
          (when on-success (on-success))
          (analytics/inc! :metabase-mq/batches-handled (assoc labels :status "success"))))
      (catch Exception e
        (log/error e (str "Error handling " transport " message") labels)
        (when on-error (on-error e))
        (analytics/inc! :metabase-mq/batches-handled (assoc labels :status "error")))
      (finally
        (analytics/observe! :metabase-mq/handle-duration-ms labels
                            (/ (double (- (System/nanoTime) start)) 1e6))))))

(defn handle-batch-failure-policy!
  "Shared retry-vs-drop policy for a just-failed batch. `failures` is the number of attempts that have
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

(defn- sliced-invoke-fn
  "Builds the `invoke-fn` that slices `messages` into `:max-batch-messages` chunks and feeds each to
  the listener `h` with per-chunk error isolation — one failing chunk doesn't block the others, but
  the whole batch is reported failed (the listener throws) so it can be nacked/redelivered. Shared by
  every backend through [[deliver!]] so all of them slice and isolate identically."
  [channel messages]
  (let [batch-size (q.registry/max-batch-messages channel)
        transport  (namespace channel)
        labels     {:transport transport :channel (name channel)}]
    (fn [h]
      (let [error (atom nil)]
        (doseq [batch (partition-all batch-size messages)]
          (try (h (vec batch))
               (catch Exception e
                 (analytics/inc! :metabase-mq/handler-errors labels)
                 (reset! error e)
                 (log/errorf e "Error handling %s message for %s, continuing"
                             transport (name channel)))))
        (when-let [e @error]
          (throw (ex-info "One or more messages failed" {} e)))))))

(defn- decode-or-drop!
  "Decodes the opaque `payload` for `channel`. Returns the decoded messages on success. If the payload
  can't be decoded (corrupt/incompatible — something retrying can never fix) logs an error,
  increments `batches-dropped` `reason=undecodable`, and returns [[undecodable]] so callers drop the
  message instead of letting the exception escape past the retry/drop machinery."
  [channel payload]
  (try
    (payload/decode payload)
    (catch Exception e
      (log/error e "Dropping queue message with an undecodable payload"
                 {:channel channel :payload-bytes (count (str payload))})
      (analytics/inc! :metabase-mq/batches-dropped {:channel (name channel) :reason "undecodable"})
      undecodable)))

(defn deliver!
  "Backend-agnostic delivery core, shared by every queue backend. Decodes the opaque `payload` for
  `channel` (the single point where messages re-enter the typed world), resolves the channel's
  listener, and — if one is running on this node — invokes it with batch-slicing, per-chunk error
  isolation, and the same metrics on every backend. Also records delivery activity for idle tracking.

  Returns a *normalized* result the calling backend interprets; it never acks, nacks, reschedules, or
  otherwise touches backend state, so poll and push backends can share it:

    [[no-listener]]  — no listener for `channel` runs on this node (the message wasn't consumed)
    [[undecodable]]  — the payload is corrupt/incompatible and can never be delivered on any node
    nil              — delivered successfully
    a Throwable      — the listener failed; the caller retries or drops per its own policy

  Poll backends turn these into ack/nack on a stored batch ([[metabase.mq.queue.polling]]); push
  backends turn them into trigger completion/requeue/refire ([[metabase.mq.queue.quartz]])."
  [channel payload]
  (swap! last-activity* assoc channel (System/nanoTime))
  (let [messages (decode-or-drop! channel payload)]
    (if (= undecodable messages)
      undecodable
      (if-let [listener (:listener (listener/get-listener channel))]
        (let [labels {:transport (namespace channel) :channel (name channel)}
              error  (atom nil)]
          (analytics/inc! :metabase-mq/messages-received labels (count messages))
          (invoke-listener!
           {:channel     channel
            :listener-fn (constantly listener)
            :invoke-fn   (sliced-invoke-fn channel messages)
            :on-error    (fn [e] (reset! error e))})
          @error)
        no-listener))))
