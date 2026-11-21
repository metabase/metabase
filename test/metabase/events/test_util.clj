(ns metabase.events.test-util
  "Helpers for tests that register consumers of the lifecycle events."
  (:require
   [metabase.events.batch :as events.batch]
   [toucan2.core]))

(defn unregister!
  "Remove the owned consumer, capture, statement capture and sink registered under `consumer-key`."
  [consumer-key]
  (doseq [registry [#'events.batch/owned-consumers #'events.batch/capturers #'events.batch/statement-capturers
                    #'events.batch/sinks]]
    (swap! @registry dissoc consumer-key))
  nil)

(defn do-without-delivery!
  "Call `thunk` with the events of its writes collected but not delivered, so that a count of its statements leaves out
  the consumers, which run once per owner."
  [thunk]
  (with-redefs-fn {#'events.batch/deliver! (fn [& _] nil)} thunk))

(defmacro without-delivery
  "Run `body` as [[do-without-delivery!]] does."
  [& body]
  `(do-without-delivery! (fn [] ~@body)))

(defn statement-count!
  "Call `thunk` with the events of its writes not delivered, and return the number of statements it ran."
  [thunk]
  (without-delivery
   (toucan2.core/with-call-count [call-count]
     (thunk)
     (call-count))))
