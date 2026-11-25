(ns metabase.events.test-util
  "Helpers for tests that count the statements of the consumers of the lifecycle events."
  (:require
   [metabase.events.core :as events]
   [metabase.events.impl :as events.impl]
   [toucan2.connection :as t2.conn]
   [toucan2.core]
   [toucan2.pipeline]
   [toucan2.tools.identity-query])
  (:import
   (toucan2.tools.identity_query IdentityConnection)))

(defn do-without-delivery!
  "Call `thunk` with the events of its writes not delivered, so that a count of its statements leaves out the
  consumers."
  [thunk]
  (with-redefs-fn {#'events.impl/publish-event! (fn [_topic event] event)
                   #'events/publish-event!      (fn [_topic event] event)}
    thunk))

(defn published-topics!
  "Call `thunk` with the events of its writes not delivered and return the topics it published, in order."
  [thunk]
  (let [topics (atom [])
        record (fn [topic event] (swap! topics conj topic) event)]
    (with-redefs-fn {#'events.impl/publish-event! record
                     #'events/publish-event!      record}
      thunk)
    @topics))

(defn published-events!
  "Call `thunk` with the events of its writes not delivered and return them, each a pair of topic and event, in order."
  [thunk]
  (let [published (atom [])
        record    (fn [topic event] (swap! published conj [topic event]) event)]
    (with-redefs-fn {#'events.impl/publish-event! record
                     #'events/publish-event!      record}
      thunk)
    @published))

(defmacro without-delivery
  "Run `body` as [[do-without-delivery!]] does."
  [& body]
  `(do-without-delivery! (fn [] ~@body)))

(defn statement-count!
  "Call `thunk` with the events of its writes not published, and return the number of statements it ran."
  [thunk]
  (without-delivery
   (toucan2.core/with-call-count [call-count]
     (thunk)
     (call-count))))

(defn delivery-statement-count!
  "Call `thunk` and return the number of statements that the consumers of the events of its writes ran."
  [thunk]
  (let [total   (atom 0)
        publish @#'events.impl/publish-event!
        counted (fn [topic event]
                  (toucan2.core/with-call-count [call-count]
                    (try
                      (publish topic event)
                      (finally
                        (swap! total + (call-count))))))]
    (with-redefs-fn {#'events.impl/publish-event! counted
                     #'events/publish-event!      counted}
      thunk)
    @total))

(defn consumer-statement-count!
  "The statements that the consumers of the events of `write`, a function of the ids of new rows of `model` inserted
  from `rows`, run with `on`, a function of a thunk that turns consumers on, beyond those they run with `off`, each run
  on rows of its own, which it deletes afterwards."
  [model rows write on off]
  (let [run (fn [wrap]
              (let [ids (toucan2.core/insert-returning-pks! model rows)]
                (try
                  (wrap #(delivery-statement-count! (fn [] (write ids))))
                  (finally
                    (toucan2.core/delete! model :id [:in ids])))))]
    (- (run on) (run off))))

(defn real-statement-count!
  "Call `thunk`, with the events of its writes delivered, and return the number of statements that reached the app DB,
  leaving out the identity queries that `t2/with-call-count` also counts."
  [thunk]
  (let [real (atom 0)]
    (binding [toucan2.pipeline/*call-count-thunk* (fn []
                                                    (when-not (instance? IdentityConnection t2.conn/*current-connectable*)
                                                      (swap! real inc)))]
      (thunk))
    @real))
