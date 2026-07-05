(ns metabase.search.index-queue-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.index-queue :as iq]))

(defn- recording-handler
  "Returns [handler results-atom] where handler appends each batch to results-atom."
  []
  (let [results (atom [])]
    [(fn [batch] (swap! results conj (vec batch))) results]))

(defn- async-test-queue
  [name handler & {:as opts}]
  (iq/async-queue (merge {:delay-ms      0
                          :listener-name name
                          :handler       handler
                          :listener-opts {:max-batch-messages 50 :max-next-ms 10}}
                         opts)))

(deftest async-enqueue-processes-and-becomes-idle-test
  (let [[handler results] (recording-handler)
        q                  (async-test-queue "iq-test-basic" handler)]
    (try
      (iq/start! q)
      (iq/enqueue! q [[:card 1] [:card 2]])
      (is (true? (iq/await-idle! q {:timeout-ms 2000})) "queue drains")
      (is (= #{[:card 1] [:card 2]} (set (apply concat @results))))
      (finally (iq/stop! q)))))

(deftest in-flight-counted-until-handler-completes-test
  (testing "a dequeued-but-still-processing batch keeps the queue non-idle even though the queue itself is empty"
    (let [release (promise)
          started (promise)
          handler (fn [_batch] (deliver started true) @release)
          q       (async-test-queue "iq-test-inflight" handler)]
      (try
        (iq/start! q)
        (iq/enqueue! q [[:card 1]])
        (is (true? (deref started 2000 false)) "handler picked up the batch")
        ;; The single message is now off the queue (queue size == 0) but the handler has
        ;; not returned. The queue MUST still report itself as busy.
        (is (false? (iq/idle? q))
            "must not be idle while a batch is in flight")
        (is (pos? (iq/pending-count q)))
        (deliver release :done)
        (is (true? (iq/await-idle! q {:timeout-ms 2000}))
            "idle once the in-flight batch completes")
        (finally
          (deliver release :done)
          (iq/stop! q))))))

(deftest await-idle-times-out-test
  (let [release (promise)
        handler (fn [_batch] @release)
        q       (async-test-queue "iq-test-timeout" handler)]
    (try
      (iq/start! q)
      (iq/enqueue! q [[:card 1]])
      (is (false? (iq/await-idle! q {:timeout-ms 200 :poll-ms 10}))
          "returns false when work never completes")
      (finally
        (deliver release :done)
        (iq/stop! q)))))

(deftest lifecycle-test
  (let [[handler _] (recording-handler)
        q           (async-test-queue "iq-test-lifecycle" handler)]
    (is (false? (boolean (iq/running? q))) "not running before start")
    (iq/start! q)
    (is (true? (iq/running? q)) "running after start")
    (iq/stop! q)
    (is (false? (boolean (iq/running? q))) "not running after stop")))

(deftest clear-resets-pending-test
  (let [[handler _] (recording-handler)
        ;; large delay so messages never become takeable during the test
        q           (async-test-queue "iq-test-clear" handler :delay-ms 100000)]
    (iq/enqueue! q [[:card 1] [:card 2] [:card 3]])
    (is (pos? (iq/pending-count q)) "pending after enqueue")
    (iq/clear! q)
    (is (zero? (iq/pending-count q)) "cleared")
    (is (true? (iq/idle? q)))))

(deftest sync-queue-runs-inline-and-is-always-idle-test
  (let [[handler results] (recording-handler)
        q                  (iq/sync-queue handler)]
    (is (true? (iq/idle? q)))
    (iq/enqueue! q [[:card 1] [:card 2]])
    (is (= [[[:card 1] [:card 2]]] @results) "handler invoked inline with the whole batch")
    (is (zero? (iq/pending-count q)))
    (is (true? (iq/await-idle! q {})))
    (is (true? (iq/running? q)))))
