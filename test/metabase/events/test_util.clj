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

(defn delivery-statement-count!
  "Call `thunk` and return the number of statements that the delivery of the events of its writes ran: the consumers
  and the flushes of the sinks, in every round of every batch."
  [thunk]
  (let [total   (atom 0)
        counted (fn [f]
                  (fn [& args]
                    (toucan2.core/with-call-count [call-count]
                      (try
                        (apply f args)
                        (finally
                          (swap! total + (call-count)))))))]
    (with-redefs-fn {#'events.batch/deliver!     (counted @#'events.batch/deliver!)
                     #'events.batch/flush-sinks! (counted @#'events.batch/flush-sinks!)}
      thunk)
    @total))

(defn consumer-statement-count!
  "The statements that the delivery of the events of `write`, a function of the ids of new rows of `model` inserted from
  `rows`, runs in one batch with `on`, a function of a thunk that turns consumers on, beyond those it runs with `off`,
  each run on rows of its own, which it deletes afterwards."
  [model rows write on off]
  (let [run (fn [wrap]
              (let [ids (toucan2.core/insert-returning-pks! model rows)]
                (try
                  (wrap #(delivery-statement-count! (fn [] (events.batch/with-batched-events (write ids)))))
                  (finally
                    (toucan2.core/delete! model :id [:in ids])))))]
    (- (run on) (run off))))
