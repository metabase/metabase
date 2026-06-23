(ns metabase.mq.queue.quartz-test
  "Tests for the push-based Quartz queue backend. Quartz fires jobs on its own worker threads, so —
  unlike the poll backends exercised via `with-test-mq` — these tests register the listener on the
  root `*listeners*` (the production registration path; Quartz threads don't inherit the test
  thread's dynamic bindings) and drive the backend directly under an in-memory `with-temp-scheduler!`."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.quartz :as q.quartz]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- wait-for!
  "Polls `pred` until it returns truthy or `timeout-ms` elapses; returns the final value."
  ([pred] (wait-for! pred 5000))
  ([pred timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       (or (pred)
           (when (< (System/currentTimeMillis) deadline)
             (Thread/sleep 10)
             (recur)))))))

(defn- do-with-queue!
  "Registers `queue` (with a listener) on the root registry/listeners for the duration of `thunk`,
  cleaning both up afterwards. Mirrors how production wires a queue + listener globally."
  [queue listener thunk]
  (q.registry/register-queue! queue {:transactional :try})
  (listener/batch-listen! queue listener)
  (try
    (thunk)
    (finally
      (listener/unlisten! queue)
      (swap! q.registry/*queues* dissoc queue))))

(defn- publish! [queue & msgs]
  (q.backend/publish! q.quartz/backend queue (payload/encode (vec msgs))))

(deftest quartz-delivers-published-message-test
  (testing "a published batch is delivered to the registered listener"
    (mt/with-temp-scheduler!
      (let [received (atom [])
            queue    (keyword "queue" (str "quartz-deliver-" (random-uuid)))]
        (do-with-queue!
         queue
         (fn [msgs] (swap! received into msgs))
         (fn []
           (publish! queue "a" "b" "c")
           (wait-for! #(= 3 (count @received)))
           (is (= #{"a" "b" "c"} (set @received))
               "every published message reaches the listener")))))))

(deftest quartz-retries-failed-batch-test
  (testing "a batch whose listener throws is redelivered until it succeeds"
    (with-redefs [q.quartz/retry-delay-ms (constantly 1)]
      (mt/with-temp-scheduler!
        (let [attempts (atom 0)
              queue    (keyword "queue" (str "quartz-retry-" (random-uuid)))]
          (do-with-queue!
           queue
           (fn [_msgs]
             ;; fail the first attempt, succeed on the retry
             (when (= 1 (swap! attempts inc))
               (throw (ex-info "boom" {}))))
           (fn []
             (publish! queue "retry-me")
             (is (wait-for! #(>= @attempts 2))
                 "listener is invoked again after the first failure")
             (is (= 2 @attempts)
                 "delivery stops once the retry succeeds"))))))))

(deftest quartz-drops-after-max-retries-test
  (testing "a batch that keeps failing is dropped after queue-max-retries attempts"
    (with-redefs [q.quartz/retry-delay-ms (constantly 1)]
      (mt/with-temp-scheduler!
        (let [attempts (atom 0)
              queue    (keyword "queue" (str "quartz-drop-" (random-uuid)))]
          (do-with-queue!
           queue
           (fn [_msgs] (swap! attempts inc) (throw (ex-info "always boom" {})))
           (fn []
             (publish! queue "doomed")
             (is (wait-for! #(= (mq.settings/queue-max-retries) @attempts))
                 "the batch is attempted exactly queue-max-retries times")
             ;; give any erroneous extra retry a chance to fire, then confirm it didn't
             (Thread/sleep 100)
             (is (= (mq.settings/queue-max-retries) @attempts)
                 "no further attempts after the batch is dropped"))))))))

(deftest quartz-no-listener-is-dropped-test
  (testing "a message for a queue with no listener is delivered-and-dropped (no error, no retry loop)"
    (mt/with-temp-scheduler!
      (let [queue (keyword "queue" (str "quartz-nolistener-" (random-uuid)))]
        ;; deliver-reporting! treats a missing listener as success, so nothing is rescheduled.
        (is (true? (mq.impl/deliver-reporting! queue (payload/encode ["orphan"]))))))))
