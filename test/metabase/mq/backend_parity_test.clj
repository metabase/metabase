(ns metabase.mq.backend-parity-test
  "Contract-level parity between the queue/topic backends.

  Each scenario is written once and run against every backend kind so that
  semantic drift between the memory and appdb implementations is caught at
  the source rather than discovered later in production.

  Every scenario is ALSO run with `:duplicate-delivery? true` so that
  listeners in the parity suite are forced to tolerate the MQ's at-least-
  once contract. Assertions use multiset / containment checks rather than
  exact-sequence equality so that a single logical message can legitimately
  be delivered more than once.

  Scenarios use `mq.tu/eventually!` rather than `mq.tu/flush!` for their
  assertions, because `wait-for-idle!` cannot see pending rows inside the
  appdb tables — it only checks the publish buffer, the worker-pool busy
  set, and memory channels."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.test-util :as mq.tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private backend-kinds
  "Backend kinds exercised by the parity scenarios. `:memory` covers the
  fast async in-process backend; `:appdb` covers the durable DB-backed one."
  [:memory :appdb])

(def ^:private delivery-modes
  "Delivery modes exercised by the parity scenarios. `:normal` is the
  production path; `:duplicate` wraps both backends with a decorator that
  publishes every message twice, forcing listeners to tolerate at-least-
  once delivery."
  [:normal :duplicate])

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
  "Runs `scenario-fn` once per (kind × delivery-mode) combination. Each
  invocation gets a freshly-minted unique channel keyword so scenarios do
  not interfere with each other. On completion the scenario's channel is
  unlistened (if still present) and any appdb rows for it are cleaned up."
  ([channel-prefix scenario-fn]
   (run-parity! backend-kinds delivery-modes channel-prefix scenario-fn))
  ([kinds modes channel-prefix scenario-fn]
   (doseq [kind  kinds
           mode  modes]
     (testing (str kind " backend / " mode " delivery")
       (let [channel (unique-channel (namespace channel-prefix) (name channel-prefix))]
         (try
           (mq.tu/with-test-mq [ctx {:backend                kind
                                     :duplicate-delivery? (= mode :duplicate)}]
             (scenario-fn ctx channel))
           (finally
             (when (= :appdb kind)
               (cleanup-appdb-channel! channel)))))))))

(deftest queue-delivers-published-messages-test
  (run-parity!
   :queue/parity-delivery
   (fn [ctx queue-name]
     (let [received (atom [])]
       (mq/listen! queue-name {} #(swap! received conj %))
       (mq/with-queue queue-name [q]
         (mq/put q "a")
         (mq/put q "b")
         (mq/put q "c"))
       (mq.tu/eventually! ctx
                          #(= #{"a" "b" "c"} (set @received))
                          scenario-timeout-ms)
       (is (= #{"a" "b" "c"} (set @received))
           "Every unique message was delivered at least once")
       (is (every? pos? (vals (frequencies @received)))
           "No spurious messages appeared in @received")
       (mq/unlisten! queue-name)))))

(deftest topic-delivers-published-messages-test
  (run-parity!
   :topic/parity-delivery
   (fn [ctx topic-name]
     (let [received (atom [])]
       (mq/listen! topic-name {} #(swap! received conj %))
       (mq/with-topic topic-name [t]
         (mq/put t "x")
         (mq/put t "y"))
       (mq.tu/eventually! ctx
                          #(= #{"x" "y"} (set @received))
                          scenario-timeout-ms)
       (is (= #{"x" "y"} (set @received))
           "Every unique topic message was delivered at least once")
       (mq/unlisten! topic-name)))))

(deftest topic-error-isolation-test
  (run-parity!
   :topic/parity-errors
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
       (mq.tu/eventually! ctx
                          #(= #{"good-1" "good-2"} (set @received))
                          scenario-timeout-ms)
       (is (= #{"good-1" "good-2"} (set @received))
           "Good messages delivered; bad message isolated from neighbours")
       (is (not (contains? (set @received) "bad"))
           "The throwing message never ends up in @received")
       (mq/unlisten! topic-name)))))

(deftest queue-retries-failed-batch-test
  (run-parity!
   :queue/parity-retry
   (fn [ctx queue-name]
     (let [calls-by-msg (atom {})]
       (mq/listen! queue-name {}
                   (fn [msg]
                     (let [n (get (swap! calls-by-msg update msg (fnil inc 0)) msg)]
                       (when (= 1 n)
                         (throw (ex-info "first attempt" {:msg msg}))))))
       (mq/with-queue queue-name [q]
         (mq/put q "retry-me"))
       (mq.tu/eventually! ctx
                          #(>= (get @calls-by-msg "retry-me" 0) 2)
                          scenario-timeout-ms)
       (is (>= (get @calls-by-msg "retry-me" 0) 2)
           "Message delivered at least twice (retry-after-failure or chaos duplication)")
       (mq/unlisten! queue-name)))))
