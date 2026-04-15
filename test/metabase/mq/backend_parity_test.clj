(ns metabase.mq.backend-parity-test
  "Contract-level parity between the queue/topic backends.

  Each scenario is written once and run against every backend kind so that
  semantic drift between the memory and appdb implementations is caught at the
  source rather than discovered later in production.

  Scenarios use `mq.tu/eventually` rather than `mq.tu/flush!` for their
  assertions, because `wait-for-idle!` cannot see pending rows inside the
  appdb tables — it only checks the publish buffer, the worker-pool busy set,
  and memory channels."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.test-util :as mq.tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private backend-kinds
  "The backend kinds exercised by the parity scenarios. `:memory` covers the
  fast async in-process backend; `:appdb` covers the durable DB-backed one."
  [:memory :appdb])

(def ^:private scenario-timeout-ms
  "Budget for waiting on eventual delivery in parity scenarios. appdb runs
  through the publish buffer → DB insert → 5s-default poll loop, but the
  fixture's `wait-for-idle!` calls `notify-all!` each tick so the effective
  poll latency is much lower."
  10000)

(defn- cleanup-appdb-channel!
  "Removes any rows left in the message tables for the given channel so a
  parity scenario does not pollute later tests."
  [channel]
  (case (namespace channel)
    "queue" (t2/delete! :queue_message_batch :queue_name (name channel))
    "topic" (t2/delete! :topic_message_batch :topic_name (name channel))))

(defn- unique-channel [transport-ns suffix]
  (keyword transport-ns (str suffix "-" (random-uuid))))

(defn- run-parity!
  "Runs `scenario-fn` once per kind in `kinds`. Each scenario receives
  `[ctx channel]`. On completion the channel is unlistened if still present
  and any appdb rows for it are cleaned up."
  ([channel scenario-fn]
   (run-parity! backend-kinds channel scenario-fn))
  ([kinds channel scenario-fn]
   (doseq [kind kinds]
     (testing (str kind " backend")
       (try
         (mq.tu/do-with-test-mq
          {:kind kind}
          (fn [ctx]
            (scenario-fn ctx channel)))
         (finally
           (when (= :appdb kind)
             (cleanup-appdb-channel! channel))))))))

(deftest queue-delivers-published-messages-test
  (let [channel (unique-channel "queue" "parity-delivery")]
    (run-parity!
     channel
     (fn [ctx queue-name]
       (let [received (atom [])]
         (mq/listen! queue-name {} #(swap! received conj %))
         (mq/with-queue queue-name [q]
           (mq/put q "a")
           (mq/put q "b")
           (mq/put q "c"))
         (mq.tu/eventually ctx
                           #(= 3 (count @received))
                           scenario-timeout-ms)
         (is (= ["a" "b" "c"] @received))
         (mq/unlisten! queue-name))))))

(deftest topic-delivers-published-messages-test
  (let [channel (unique-channel "topic" "parity-delivery")]
    (run-parity!
     channel
     (fn [ctx topic-name]
       (let [received (atom [])]
         (mq/listen! topic-name {} #(swap! received conj %))
         (mq/with-topic topic-name [t]
           (mq/put t "x")
           (mq/put t "y"))
         (mq.tu/eventually ctx
                           #(= 2 (count @received))
                           scenario-timeout-ms)
         (is (= ["x" "y"] @received))
         (mq/unlisten! topic-name))))))

(deftest topic-error-isolation-test
  (let [channel (unique-channel "topic" "parity-errors")]
    (run-parity!
     channel
     (fn [ctx topic-name]
       (let [received (atom [])]
         (mq/listen! topic-name {}
                     (fn [msg]
                       (when (= "bad" msg)
                         (throw (ex-info "handler error" {})))
                       (swap! received conj msg)))
         (mq/with-topic topic-name [t]
           (mq/put t "good-1")
           (mq/put t "bad")
           (mq/put t "good-2"))
         (mq.tu/eventually ctx
                           #(= 2 (count @received))
                           scenario-timeout-ms)
         (is (= ["good-1" "good-2"] @received))
         (mq/unlisten! topic-name))))))

(deftest queue-retries-failed-batch-test
  (let [channel (unique-channel "queue" "parity-retry")]
    (run-parity!
     channel
     (fn [ctx queue-name]
       (let [call-count (atom 0)]
         (mq/listen! queue-name {}
                     (fn [_msg]
                       (let [n (swap! call-count inc)]
                         (when (= 1 n)
                           (throw (ex-info "first attempt" {}))))))
         (mq/with-queue queue-name [q]
           (mq/put q "retry-me"))
         (mq.tu/eventually ctx
                           #(>= @call-count 2)
                           scenario-timeout-ms)
         (is (>= @call-count 2)
             "Message retried at least once after initial failure")
         (mq/unlisten! queue-name))))))
