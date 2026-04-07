(ns metabase.mq.publish
  "Publishing pipeline: buffering, transaction support, and the `with-buffer` macro."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *defer-in-transaction?*
  "When true (the default), messages published inside a transaction are deferred
  until after the transaction commits. Bind to false in sync/test mode where
  listeners must process inline."
  true)

(defprotocol MessageBuffer
  "Protocol for buffering messages before publishing."
  (put [this msg]
    "Put a message on the buffer."))

(defn publish!
  "Publishes messages to a channel. Applies dedup-fn if registered, buffers,
   publishes to the appropriate backend, and records analytics."
  [channel messages]
  (let [{:keys [dedup-fn]} (listener/get-listener channel)
        before-count (count messages)
        messages     (if dedup-fn (dedup-fn messages) messages)]
    (when (and dedup-fn (< (count messages) before-count))
      (analytics/inc! :metabase-mq/dedup-messages-dropped
                      {:channel (name channel)}
                      (- before-count (count messages))))
    (when (seq messages)
      (mq.impl/record-publish-activity! channel)
      (publish-buffer/buffered-publish! channel messages)
      (analytics/inc! :metabase-mq/messages-published
                      {:transport (namespace channel) :channel (name channel)}
                      (count messages)))))

(defn flush-deferred-messages!
  "Flushes all deferred messages accumulated during a transaction.
   Called as an after-commit callback. Per-channel try/catch so one failure doesn't block others."
  []
  (when-let [state (mdb/transaction-state)]
    (let [deferred (::deferred-messages @state)]
      (doseq [[channel msgs] deferred]
        (try
          (publish! channel msgs)
          (catch Exception e
            (log/error e "Error flushing deferred messages" {:channel channel})))))))

(defn defer-in-transaction!
  "Accumulates msgs in *transaction-state* under [::deferred-messages channel].
   Registers flush-deferred-messages! as an after-commit callback once per transaction.
   If *defer-in-transaction?* is false (set in tests), immediately publishes"
  [channel msgs]
  (if *defer-in-transaction?*
    (let [state     (mdb/transaction-state)
          old-state (first (swap-vals! state
                                       (fn [s]
                                         (-> s
                                             (update-in [::deferred-messages channel] (fnil into []) msgs)
                                             (assoc ::flush-registered? true)))))]
      (when-not (::flush-registered? old-state)
        (mdb/after-commit! flush-deferred-messages!)))
    (publish! channel msgs)))

(defn run-with-buffer
  "Runs `body-fn` with a MessageBuffer. On success, publishes collected messages —
   deferred if inside a transaction, immediate via publish! otherwise.
   Channels with `:sync-local-delivery true` in their listener config always publish
   immediately, even inside a transaction.
   On exception, discards buffered messages and rethrows."
  [channel error-label body-fn]
  (let [buffer     (atom [])
        msg-buffer (reify MessageBuffer
                     (put [_ msg] (swap! buffer conj msg)))]
    (try
      (let [result (body-fn msg-buffer)
            msgs   @buffer]
        (when (seq msgs)
          (if (and (mdb/transaction-state)
                   (not (:sync-local-delivery (listener/get-listener channel))))
            (defer-in-transaction! channel msgs)
            (publish! channel msgs)))
        result)
      (catch Exception e
        (log/error e error-label)
        (throw e)))))

(defmacro with-buffer
  "Runs the body with a MessageBuffer for the given channel.
   Messages are buffered and only published if the body completes successfully.
   Inside a transaction, messages are deferred until after commit."
  [channel [binding] & body]
  `(run-with-buffer
    ~channel
    (str "Error in " (namespace ~channel) " processing")
    (fn [~binding] ~@body)))
