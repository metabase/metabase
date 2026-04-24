(ns metabase.mq.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as app-db.conn]
   [metabase.mq.core :as mq]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.publish :as mq.publish]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.test-util :as mq.tu])
  (:import (clojure.lang ExceptionInfo)
           (java.util.concurrent CountDownLatch CyclicBarrier)))

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
                            (mq/listen! :queue/test {} (fn [_] nil)))))))

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
                                          (mq/listen! queue-name {} (fn [_] nil))
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
      {:queue/exclusive-test {:listener           (fn [message]
                                                    (swap! heard-messages conj message))
                              :max-batch-messages 1
                              :exclusive          true}}
      (testing "Exclusive queue processes messages via the async memory backend"
        (mq/with-queue :queue/exclusive-test [q]
          (mq/put q "msg1")
          (mq/put q "msg2"))
        (mq.tu/flush! test-mq)
        (is (= ["msg1" "msg2"] @heard-messages))))))

(deftest batch-listen-exclusive-test
  (let [heard-batches (atom [])]
    (mq.tu/with-test-mq [test-mq]
      (mq/batch-listen! :queue/batch-exclusive
                        (fn [batch] (swap! heard-batches conj batch))
                        {:max-batch-messages 10 :exclusive true})
      (testing "Exclusive batch-listen! registers and processes"
        (mq/with-queue :queue/batch-exclusive [q]
          (mq/put q "a")
          (mq/put q "b"))
        (mq.tu/flush! test-mq)
        (is (= [["a" "b"]] @heard-batches))))))

(deftest transaction-defers-publish-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      {:queue/test (fn [msg] (swap! heard conj msg))}
      (binding [app-db.conn/*after-commit*  (atom [])
                app-db.conn/*transaction-state* (atom {})]
        (testing "Inside a transaction, messages are accumulated, not published immediately"
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
            (is (= [] @heard))))
        (testing "After flush (simulating commit), all messages are delivered"
          (mq.publish/flush-deferred-messages!)
          (mq.tu/flush! test-mq)
          (is (= ["msg1" "msg2" "msg3"] @heard)))))))

(deftest transaction-rollback-discards-messages-test
  (mq.tu/with-test-mq [test-mq]
    {:queue/test (fn [_] nil)}
    (binding [app-db.conn/*after-commit*  (atom [])
              app-db.conn/*transaction-state* (atom {})]
      (testing "Messages accumulated during a failed transaction are discarded"
        (is (thrown? Exception
                     (mq/with-queue :queue/test [q]
                       (mq/put q "should-be-discarded")
                       (throw (ex-info "boom" {})))))
        (is (nil? (get-in @app-db.conn/*transaction-state*
                          [::mq.publish/deferred-messages :queue/test]))
            "No messages should be in transaction state after exception")
        (mq.tu/flush! test-mq)))))

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
      {:queue/test-a (fn [msg] (swap! heard-a conj msg))
       :queue/test-b (fn [msg] (swap! heard-b conj msg))}
      (binding [app-db.conn/*after-commit*  (atom [])
                app-db.conn/*transaction-state* (atom {})]
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
                         [::mq.publish/deferred-messages :queue/test-b]))))
        (testing "After flush, both queues receive their messages"
          (mq.publish/flush-deferred-messages!)
          (mq.tu/flush! test-mq)
          (is (= ["a1" "a2"] @heard-a))
          (is (= ["b1"] @heard-b)))))))

(deftest buffering-combines-messages-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [test-mq]
      (mq/batch-listen! :queue/test
                        (fn [batch] (swap! heard into batch))
                        {:max-batch-messages 50})
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
      (mq/batch-listen! :queue/test
                        (fn [batch] (swap! heard into batch))
                        {:max-batch-messages 3})
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

(deftest fifo-ordering-test
  (let [received (atom [])]
    (mq.tu/with-test-mq [test-mq]
      {:queue/test (fn [message] (swap! received conj message))}
      (doseq [i (range 10)]
        (mq/with-queue :queue/test [q]
          (mq/put q i)))
      (mq.tu/flush! test-mq)
      (testing "All messages are delivered in order"
        (is (= (range 10) @received))))))

(deftest exclusive-queue-single-active-handler-test
  "Verifies that submit-delivery! returns false for a channel that already has an
   active handler, enforcing at-most-one concurrent delivery per channel."
  (mq.impl/start-worker-pool!)
  (mq.tu/with-test-mq [_test-mq]
    (let [queue-name :queue/exclusive-concurrency-test
          latch      (CountDownLatch. 1)]
      (mq/listen! queue-name {:exclusive true}
                  (fn [_] (.await latch))) ; Block listener until released
      (testing "First submission succeeds and marks the channel as busy"
        (is (true? (mq.impl/submit-delivery! queue-name ["msg1"] nil nil nil)))
        (Thread/sleep 50) ; Give worker thread time to start and block on latch
        (is (true? (mq.impl/channel-busy? queue-name))))
      (testing "Second submission returns false while channel is busy"
        (is (false? (mq.impl/submit-delivery! queue-name ["msg2"] nil nil nil))))
      (.countDown latch) ; Release the listener
      (Thread/sleep 100) ; Wait for delivery to complete and active-handlers to clear
      (testing "Channel is no longer busy after delivery completes"
        (is (false? (mq.impl/channel-busy? queue-name))))
      (mq/unlisten! queue-name))))
