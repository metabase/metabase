(ns metabase.mq.queue.polling-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.polling :as q.polling]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest run-recover-stale-drops-use-distinct-reason-test
  (testing "batches dropped by stale recovery are metered with their own reason (stale-recovery-exhausted) and a stringified channel — not conflated with normal delivery-retry exhaustion"
    (mt/with-prometheus-system! [_ system]
      (let [backend (reify q.backend/QueueBackend
                      (backend-id        [_] :queue.backend/test)
                      (publish!          [_ _queue _payload] nil)
                      (fetch!            [_ _available] nil)
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
