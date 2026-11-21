(ns metabase.events.test-util
  "Helpers for tests that count the statements of the consumers of the lifecycle events."
  (:require
   [metabase.events.core :as events]
   [metabase.events.publish :as events.publish]
   [toucan2.core]))

(defn unregister!
  "Remove the capture and statement capture registered under `consumer-key`."
  [consumer-key]
  (doseq [registry [#'events.publish/capturers #'events.publish/statement-capturers]]
    (swap! @registry dissoc consumer-key))
  nil)

(defn do-without-delivery!
  "Call `thunk` with the lifecycle events of its writes not published, so that a count of its statements leaves out the
  consumers."
  [thunk]
  (with-redefs-fn {#'events.publish/publish-lifecycle! (fn [& _] nil)
                   #'events/publish-lifecycle!         (fn [& _] nil)}
    thunk))

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
  "Call `thunk` and return the number of statements that the consumers of the lifecycle events of its writes ran."
  [thunk]
  (let [total   (atom 0)
        publish @#'events.publish/publish-lifecycle!
        counted (fn [& args]
                  (toucan2.core/with-call-count [call-count]
                    (try
                      (apply publish args)
                      (finally
                        (swap! total + (call-count))))))]
    (with-redefs-fn {#'events.publish/publish-lifecycle! counted
                     #'events/publish-lifecycle!         counted}
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
