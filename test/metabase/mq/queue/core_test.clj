(ns metabase.mq.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as app-db.conn]
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.payload :as payload]
   [metabase.mq.publish :as mq.publish]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.concurrency :as q.concurrency]
   [metabase.mq.queue.polling :as q.polling]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.test-util :as mq.tu]
   [toucan2.core :as t2])
  (:import (clojure.lang ExceptionInfo)
           (java.util.concurrent CountDownLatch CyclicBarrier TimeUnit)))

(set! *warn-on-reflection* true)

(deftest e2e-test
  (let [heard-messages (atom [])]
    (mq.tu/with-test-mq [test-mq]
      {:queue/test (fn [message] (swap! heard-messages conj message))}
      (testing "The messages are heard and processed"
        (mq/with-queue :queue/test [q]
          (mq/put q "test message 1")
          (mq/put q "test message 2"))
        (mq.tu/flush! test-mq)
        (is (= ["test message 1" "test message 2"] @heard-messages))))))

(deftest publish-to-unlistened-queue-test
  (mq.tu/with-test-mq [_test-mq]
    (testing "with-queue on a queue with no listener still succeeds"
      (mq/with-queue :queue/nonexistent [q]
        (mq/put q "msg")))))

(deftest with-queue-success-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      {:queue/test (fn [msg] (swap! heard conj msg))}
      (testing "with-queue publishes buffered messages on success"
        (let [result (mq/with-queue :queue/test [q]
                       (mq/put q "a")
                       (mq/put q "b")
                       :done)]
          (is (= :done result))
          (mq.tu/flush! test-mq)
          (is (= ["a" "b"] @heard)))))))

(deftest with-queue-exception-discards-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      {:queue/test (fn [msg] (swap! heard conj msg))}
      (testing "with-queue discards buffered messages on exception"
        (is (thrown? Exception
                     (mq/with-queue :queue/test [q]
                       (mq/put q "should-be-discarded")
                       (throw (ex-info "boom" {})))))
        (mq.tu/flush! test-mq)
        (is (empty? @heard))))))

(deftest with-queue-no-listener-test
  (mq.tu/with-test-mq [_test-mq]
    (testing "with-queue on queue with no listener still succeeds"
      (mq/with-queue :queue/nonexistent [q]
        (mq/put q "msg")))))

(deftest double-listen-throws-test
  (mq.tu/with-test-mq [_test-mq]
    {:queue/test (fn [_] nil)}
    (testing "Registering a second listener on the same queue throws"
      (is (thrown-with-msg? ExceptionInfo #"Listener already registered"
                            (mq.tu/listen! :queue/test (fn [_] nil)))))))

(deftest concurrent-listen-throws-test
  (mq.tu/with-test-mq [_test-mq]
    (let [queue-name :queue/test
          n          10
          barrier    (CyclicBarrier. n)
          results    (atom [])]
      (testing "Concurrent listen! calls: exactly one succeeds, rest throw"
        (let [threads (mapv (fn [_]
                              (let [f (bound-fn []
                                        (.await barrier)
                                        (try
                                          (mq.tu/listen! queue-name (fn [_] nil))
                                          (swap! results conj :ok)
                                          (catch ExceptionInfo _
                                            (swap! results conj :error))))]
                                (Thread. ^Runnable f)))
                            (range n))]
          (run! (fn [^Thread t] (.start t)) threads)
          (run! (fn [^Thread t] (.join t 5000)) threads)
          (is (= 1 (count (filter #{:ok} @results))))
          (is (= (dec n) (count (filter #{:error} @results))))))
      (mq/unlisten! queue-name))))

(deftest exclusive-listen-test
  (let [heard-messages (atom [])]
    (mq.tu/with-test-mq [test-mq]
      (q.registry/register-queue! :queue/exclusive-test {:transactional :try :exclusive true :max-batch-messages 1})
      (mq.tu/listen! :queue/exclusive-test #(swap! heard-messages conj %))
      (testing "Exclusive queue processes messages via the async memory backend"
        (mq/with-queue :queue/exclusive-test [q]
          (mq/put q "msg1")
          (mq/put q "msg2"))
        (mq.tu/flush! test-mq)
        ;; delivery, not order — see `every-message-is-delivered-test`. Exclusivity buys mutual
        ;; exclusion, not FIFO.
        (is (= #{"msg1" "msg2"} (set @heard-messages)))))))

(deftest exclusive-queue-is-serialized-by-the-memory-backend-test
  (testing "an :exclusive queue runs one batch at a time on the memory backend too.

            Exclusivity is a *backend* guarantee, and each backend implements its own: Quartz uses
            @DisallowConcurrentExecution on the job class; the memory backend never fetches a second
            batch for a queue that already has one in flight. The shared poll driver knows nothing
            about the flag. Before the memory backend implemented it, an :exclusive queue serialized on
            Quartz and meant nothing at all here — it only *looked* right because the driver happened
            to deliver one batch per channel at a time."
    (q.polling/start-worker-pool!)
    (mq.tu/with-test-mq [_test-mq]
      (let [queue-name :queue/exclusive-serialization-test
            in-flight  (atom 0)
            peak       (atom 0)
            arrived    (atom 0)
            release    (CountDownLatch. 1)]
        (q.registry/register-queue! queue-name {:transactional :try :exclusive true :max-batch-messages 1})
        (mq.tu/listen! queue-name (fn [_]
                                    (swap! peak max (swap! in-flight inc))
                                    (swap! arrived inc)
                                    (.await release)
                                    (swap! in-flight dec)))
        (mq/with-queue queue-name [q]
          (mq/put q "a")
          (mq/put q "b")
          (mq/put q "c"))
        (is (true? (mq.tu/wait-for! #(= 1 @arrived) 5000)))
        (is (nil? (mq.tu/wait-for! #(> @arrived 1) 500))
            "no second batch is fetched while the first is in flight")
        (.countDown release)
        (is (true? (mq.tu/wait-for! #(= 3 @arrived) 5000)) "all three still get delivered")
        (is (= 1 @peak) "never more than one batch in the listener at a time")
        (mq/unlisten! queue-name)))))

(deftest batch-listen-exclusive-test
  (let [heard-batches (atom [])]
    (mq.tu/with-test-mq [test-mq]
      (q.registry/register-queue! :queue/batch-exclusive {:transactional :try :exclusive true :max-batch-messages 10})
      (listener/batch-listen! :queue/batch-exclusive
                              (fn [batch] (swap! heard-batches conj batch)))
      (testing "Exclusive batch-listen! registers and processes"
        (mq/with-queue :queue/batch-exclusive [q]
          (mq/put q "a")
          (mq/put q "b"))
        (mq.tu/flush! test-mq)
        (is (= [["a" "b"]] @heard-batches))))))

(deftest transaction-defers-publish-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      ;; `:never` keeps the in-memory after-commit defer path under test (a `:transactional` queue
      ;; would route through the outbox table instead — see metabase.mq.queue.outbox-test).
      (q.registry/register-queue! :queue/test {:transactional :never})
      (mq.tu/listen! :queue/test (fn [msg] (swap! heard conj msg)))
      (testing "Inside a transaction, messages are accumulated, not published immediately"
        (t2/with-transaction [_conn]
          (mq/with-queue :queue/test [q]
            (mq/put q "msg1")
            (mq/put q "msg2"))
          (mq/with-queue :queue/test [q]
            (mq/put q "msg3"))
          (testing "Messages are deferred in transaction state"
            (is (= ["msg1" "msg2" "msg3"]
                   (get-in @app-db.conn/*transaction-state*
                           [::mq.publish/deferred-messages :queue/test]))))
          (testing "Listener has not been called yet"
            (is (= [] @heard)))))
      (testing "After the transaction commits, all messages are delivered"
        (mq.tu/flush! test-mq)
        (is (= ["msg1" "msg2" "msg3"] @heard))))))

(deftest transaction-rollback-discards-messages-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      (q.registry/register-queue! :queue/test {:transactional :never})
      (mq.tu/listen! :queue/test (fn [msg] (swap! heard conj msg)))
      (testing "Messages accumulated during a failed transaction are discarded"
        (is (thrown? Exception
                     (t2/with-transaction [_conn]
                       (mq/with-queue :queue/test [q]
                         (mq/put q "should-be-discarded"))
                       (throw (ex-info "boom" {})))))
        (mq.tu/flush! test-mq)
        (is (= [] @heard) "no messages are delivered from a rolled-back transaction")))))

(deftest outside-transaction-publishes-immediately-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      {:queue/test (fn [msg] (swap! heard conj msg))}
      (testing "Outside a transaction, messages are published"
        (is (nil? app-db.conn/*transaction-state*))
        (mq/with-queue :queue/test [q]
          (mq/put q "msg1"))
        (mq.tu/flush! test-mq)
        (is (= ["msg1"] @heard))))))

(deftest multiple-queues-in-transaction-test
  (let [heard-a (atom [])
        heard-b (atom [])]
    (mq.tu/with-test-mq [test-mq]
      (q.registry/register-queue! :queue/test-a {:transactional :never})
      (q.registry/register-queue! :queue/test-b {:transactional :never})
      (mq.tu/listen! :queue/test-a (fn [msg] (swap! heard-a conj msg)))
      (mq.tu/listen! :queue/test-b (fn [msg] (swap! heard-b conj msg)))
      (t2/with-transaction [_conn]
        (mq/with-queue :queue/test-a [q]
          (mq/put q "a1")
          (mq/put q "a2"))
        (mq/with-queue :queue/test-b [q]
          (mq/put q "b1"))
        (testing "Both queues have deferred messages"
          (is (= ["a1" "a2"]
                 (get-in @app-db.conn/*transaction-state*
                         [::mq.publish/deferred-messages :queue/test-a])))
          (is (= ["b1"]
                 (get-in @app-db.conn/*transaction-state*
                         [::mq.publish/deferred-messages :queue/test-b])))))
      (testing "After the transaction commits, both queues receive their messages"
        (mq.tu/flush! test-mq)
        (is (= ["a1" "a2"] @heard-a))
        (is (= ["b1"] @heard-b))))))

(deftest buffering-combines-messages-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      (q.registry/register-queue! :queue/test {:transactional :try :max-batch-messages 50})
      (listener/batch-listen! :queue/test
                              (fn [batch] (swap! heard into batch)))
      (binding [publish-buffer/*publish-buffer-ms* 100
                publish-buffer/*publish-buffer*    (atom {})]
        (testing "buffered-publish! buffers when *publish-buffer-ms* > 0"
          (mq.publish/publish! :queue/test ["msg1"])
          (mq.publish/publish! :queue/test ["msg2"])
          (is (empty? @heard)
              "Nothing delivered yet because buffer window hasn't elapsed")
          (is (= ["msg1" "msg2"]
                 (:messages (get @publish-buffer/*publish-buffer* :queue/test)))
              "Messages are buffered"))
        (testing "After flush, all messages are delivered"
          (swap! publish-buffer/*publish-buffer*
                 update :queue/test assoc :deadline-ms 1)
          (publish-buffer/flush-publish-buffer!)
          (mq.tu/flush! test-mq)
          (is (= ["msg1" "msg2"] @heard)
              "Both messages delivered after flush"))))))

(deftest buffering-immediate-when-zero-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      {:queue/test (fn [msg] (swap! heard conj msg))}
      (binding [publish-buffer/*publish-buffer-ms* 0
                publish-buffer/*publish-buffer*    (atom {})]
        (testing "When *publish-buffer-ms* is 0, messages publish without buffering"
          (mq/with-queue :queue/test [q]
            (mq/put q "msg1"))
          (mq.tu/flush! test-mq)
          (is (= ["msg1"] @heard))
          (mq/with-queue :queue/test [q]
            (mq/put q "msg2"))
          (mq.tu/flush! test-mq)
          (is (= ["msg1" "msg2"] @heard)))))))

(deftest buffering-flush-delivers-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      (q.registry/register-queue! :queue/test {:transactional :try :max-batch-messages 3})
      (listener/batch-listen! :queue/test
                              (fn [batch] (swap! heard into batch)))
      (binding [publish-buffer/*publish-buffer-ms*  1
                publish-buffer/*publish-buffer-max-ms* 0
                publish-buffer/*publish-buffer*     (atom {})]
        (testing "Messages are buffered until flushed"
          (mq.publish/publish! :queue/test ["a" "b"])
          (is (empty? @heard) "not yet flushed")
          (mq.publish/publish! :queue/test ["c"])
          (is (empty? @heard) "still buffered, no proactive flush")
          (Thread/sleep 5)
          (publish-buffer/flush-publish-buffer!)
          (mq.tu/flush! test-mq)
          (is (= ["a" "b" "c"] @heard) "all delivered after flush"))))))

(deftest every-message-is-delivered-test
  ;; Deliberately NOT an ordering test. The MQ promises at-least-once delivery, not FIFO: Quartz fires
  ;; a queue's batches on its worker threads and explicitly does not fire them in submission order, and
  ;; an uncapped queue runs them concurrently. The poll driver used to deliver one batch at a time,
  ;; which made ordering *look* guaranteed if you only ever tested against the memory backend — a
  ;; guarantee no other backend has ever offered. Asserting it here would pin a memory-only behavior
  ;; and re-introduce exactly the cross-backend divergence `:max-concurrent-batches` exists to remove.
  ;;
  ;; A queue that genuinely needs serialized delivery must say so: `:max-concurrent-batches 1` (per
  ;; node) or `:exclusive true` (cluster-wide). Even then, order is not promised — only mutual
  ;; exclusion.
  (let [received (atom [])]
    (mq.tu/with-test-mq [test-mq]
      {:queue/test (fn [message] (swap! received conj message))}
      (doseq [i (range 10)]
        (mq/with-queue :queue/test [q]
          (mq/put q i)))
      (mq.tu/flush! test-mq)
      (testing "every published message is delivered exactly once (in some order)"
        (is (= (set (range 10)) (set @received)))
        (is (= 10 (count @received)))))))

(deftest submit-delivery-counts-the-batch-against-the-node-test
  (testing "a submitted batch counts against the node's :max-concurrent-batches from hand-off until it
            finishes, which is what makes the queue report itself at capacity and stop fetching more"
    (q.polling/start-worker-pool!)
    (mq.tu/with-test-mq [_test-mq]
      (let [queue-name :queue/capped-concurrency-test
            started    (CountDownLatch. 1)   ; counted down once the worker thread enters the listener
            release    (CountDownLatch. 1)]  ; blocks the listener until the test releases it
        (q.registry/register-queue! queue-name {:transactional :try :max-concurrent-batches 1})
        (mq.tu/listen! queue-name
                       (fn [_] (.countDown started) (.await release)))
        (q.polling/submit-delivery! queue-name (payload/encode ["msg1"]) nil nil)
        (is (.await started 5 TimeUnit/SECONDS) "worker thread started and entered the listener")
        (is (true? (q.concurrency/working? queue-name)))
        (is (true? (q.concurrency/at-capacity? queue-name))
            "at its cap of 1 — so the poll loop will fetch nothing more for this queue")
        (.countDown release) ; Release the listener
        (is (true? (mq.tu/wait-for! #(not (q.concurrency/working? queue-name)) 5000))
            "the in-flight count returns to zero once delivery completes")
        (is (false? (q.concurrency/at-capacity? queue-name))
            "and the queue can be fetched for again")
        (mq/unlisten! queue-name)))))

(deftest uncapped-queue-submits-without-limit-test
  (testing "a queue that declares no :max-concurrent-batches is unbounded — the same as on Quartz.
            The poll driver used to serialize it one-batch-at-a-time, which made the *same* queue
            config mean different things depending on which backend was running."
    (q.polling/start-worker-pool!)
    (mq.tu/with-test-mq [_test-mq]
      (let [queue-name :queue/uncapped-concurrency-test
            in-listener (CountDownLatch. 3)
            release     (CountDownLatch. 1)]
        (mq.tu/listen! queue-name (fn [_] (.countDown in-listener) (.await release)))
        (dotimes [i 3]
          (q.polling/submit-delivery! queue-name (payload/encode [(str "msg" i)]) nil nil))
        (is (.await in-listener 5 TimeUnit/SECONDS)
            "all three deliveries are in the listener at the same time")
        (is (false? (q.concurrency/at-capacity? queue-name))
            "and it is never at capacity, however many are working — that is what uncapped means")
        (.countDown release)
        (is (true? (mq.tu/wait-for! #(not (q.concurrency/working? queue-name)) 5000)))
        (mq/unlisten! queue-name)))))

(deftest submit-delivery-frees-slot-when-pool-unavailable-test
  (testing "if submitting to the worker pool fails (e.g. pool not running), the claimed slot is
            released rather than held forever — otherwise a capped queue would sit permanently at
            capacity and silently stop delivering"
    (binding [q.concurrency/*in-flight* (atom {})
              q.registry/*queues*       (atom {})]
      (with-redefs [q.polling/worker-pool (atom nil)] ; deref/.submit NPEs
        (let [queue-name :queue/submit-failure-test]
          (q.registry/register-queue! queue-name {:transactional :try :max-concurrent-batches 1})
          (is (thrown? Exception
                       (q.polling/submit-delivery! queue-name (payload/encode ["x"]) nil nil))
              "the submit failure propagates to the caller")
          (is (false? (q.concurrency/working? queue-name))
              "the slot claimed for the failed submit was given back")
          (is (false? (q.concurrency/at-capacity? queue-name))
              "so the queue can still deliver"))))))
