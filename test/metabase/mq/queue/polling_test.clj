(ns metabase.mq.queue.polling-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.concurrency :as q.concurrency]
   [metabase.mq.queue.polling :as q.polling]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.test-util :as mq.tu]
   [metabase.test :as mt])
  (:import
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(deftest run-recover-stale-drops-use-distinct-reason-test
  (testing "batches dropped by stale recovery are metered with their own reason (stale-recovery-exhausted) and a stringified channel — not conflated with normal delivery-retry exhaustion"
    (mt/with-prometheus-system! [_ system]
      (let [backend (reify q.backend/QueueBackend
                      (backend-id        [_] :queue.backend/test)
                      (publish!          [_ _queue _payload] nil)
                      (fetch!            [_ _queue->free-slots] nil)
                      (queue-depths      [_] nil)
                      (batch-successful! [_ _queue _batch-id] nil)
                      (failure-count     [_ _queue _batch-id] nil)
                      (retry-batch!      [_ _queue _batch-id] nil)
                      (fail-batch!       [_ _queue _batch-id] nil)
                      (recover-stale!    [_ _stale-timeout-ms _max-retries]
                        ;; keyword channel on purpose: the emitter must stringify it to match every
                        ;; other batches-dropped emitter (which use (name channel))
                        [{:channel :orphaned-queue :recovered 0 :failed 3}])
                      (run-heartbeats!   [_] nil)
                      (start!            [_] nil)
                      (shutdown!         [_] nil))]
        (#'q.polling/run-recover-stale! backend "test-backend")
        (is (pos? (or (mt/metric-value system :metabase-mq/batches-dropped
                                       {:channel "orphaned-queue" :reason "stale-recovery-exhausted"})
                      0))
            "stale-recovery drops use reason=stale-recovery-exhausted with a stringified channel label")
        (is (not (pos? (or (mt/metric-value system :metabase-mq/batches-dropped
                                            {:channel "orphaned-queue" :reason "delivery-exhausted"})
                           0)))
            "stale-recovery drops are NOT conflated with the delivery-retry exhaustion reason")))))

;;; ------------------------------- :max-concurrent-batches -------------------------------

(defn- gated-listener
  "A listener that records its own peak concurrency. Each delivery counts itself in, parks on
  `release`, then counts itself out — so `peak` ends up holding the most that were ever inside the
  listener at the same time, which is exactly what the cap is supposed to bound."
  [in-flight peak arrived ^CountDownLatch release]
  (fn [_msg]
    (swap! peak max (swap! in-flight inc))
    (swap! arrived inc)
    (.await release)
    (swap! in-flight dec)))

(defn- publish-n! [queue n]
  (mq/with-queue queue [q]
    (doseq [i (range n)] (mq/put q {:i i}))))

(deftest max-concurrent-batches-caps-in-flight-deliveries-test
  (testing "a node delivers at most :max-concurrent-batches batches of a queue at once, and takes the
            rest only as slots free up"
    (mq.tu/with-test-mq [_ctx]
      (let [queue     :queue/capped-concurrency
            in-flight (atom 0)
            peak      (atom 0)
            arrived   (atom 0)
            release   (CountDownLatch. 1)]
        ;; one message per batch, so "batches in flight" == "messages in flight"
        (q.registry/register-queue! queue {:transactional         :try
                                           :max-batch-messages     1
                                           :max-concurrent-batches 2})
        (mq.tu/listen! queue (gated-listener in-flight peak arrived release))
        (publish-n! queue 5)
        (testing "exactly the cap is picked up while the listener is blocked"
          (is (true? (mq.tu/wait-for! #(= 2 @arrived) 5000))
              "two batches reached the listener")
          ;; Give the poll loop many chances to (wrongly) fetch a third: it spins every 50ms.
          (is (nil? (mq.tu/wait-for! #(> @arrived 2) 500))
              "no third batch is taken while the node is at capacity")
          (is (= 2 @peak) "never more than the cap in flight at once"))
        (testing "the remaining batches are delivered once the slots free"
          (.countDown release)
          (is (true? (mq.tu/wait-for! #(= 5 @arrived) 5000))
              "all 5 batches eventually delivered — capacity throttles, it doesn't drop")
          (is (= 2 @peak) "the cap held for the whole drain"))
        (mq/unlisten! queue)))))

(deftest uncapped-queue-is-unbounded-test
  (testing "a queue that declares no cap is unbounded on the poll driver too — the same as on Quartz.
            The driver used to take one batch at a time regardless, which made the *same* queue config
            mean different things depending on which backend was running."
    (mq.tu/with-test-mq [_ctx]
      (let [queue     :queue/uncapped-concurrency
            in-flight (atom 0)
            peak      (atom 0)
            arrived   (atom 0)
            release   (CountDownLatch. 1)]
        (q.registry/register-queue! queue {:transactional :try :max-batch-messages 1})
        (mq.tu/listen! queue (gated-listener in-flight peak arrived release))
        (publish-n! queue 3)
        (is (true? (mq.tu/wait-for! #(= 3 @arrived) 5000))
            "all three batches are picked up while the listener is still blocked — nothing throttles
             a queue that declared no cap")
        (is (= 3 @peak) "all three were in the listener at once")
        (.countDown release)
        (mq/unlisten! queue)))))

(deftest failed-delivery-releases-its-slot-test
  (testing "a slot is released even when the listener throws, so a failing queue can't leak capacity
            and quietly throttle itself to a standstill"
    (mq.tu/with-test-mq [_ctx]
      (let [queue    :queue/slot-release
            attempts (atom 0)]
        (q.registry/register-queue! queue {:transactional :try :max-concurrent-batches 1})
        (mq.tu/listen! queue (fn [_] (swap! attempts inc) (throw (ex-info "boom" {}))))
        (publish-n! queue 1)
        (is (true? (mq.tu/wait-for! #(pos? @attempts) 5000)) "the listener ran and threw")
        (is (true? (mq.tu/wait-for! #(zero? (q.concurrency/in-flight queue)) 5000))
            "the slot is returned after the failed delivery, not leaked")
        (mq/unlisten! queue)))))
