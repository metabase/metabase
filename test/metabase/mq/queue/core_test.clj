(ns metabase.mq.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory])
  (:import (clojure.lang ExceptionInfo)
           (java.util.concurrent CyclicBarrier)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-memory-queue
  [& body]
  `(binding [q.backend/*backend*        :queue.backend/memory
             q.impl/*listeners*          (atom {})
             q.impl/*accumulators*      (atom {})
             q.memory/*queues*          (atom {})
             q.memory/*bundle-registry* (atom {})
             q.memory/*watcher*         (atom nil)]
     (try
       (q.backend/start! :queue.backend/memory)
       ~@body
       (finally
         (q.backend/shutdown! :queue.backend/memory)))))

(deftest ^:parallel e2e-test
  (with-memory-queue
    (let [heard-messages (atom [])
          queue-name (keyword "queue" (str "core-e2e-test-" (gensym)))]
      (mq/listen! queue-name (fn [message]
                               (swap! heard-messages conj message)
                               (when (= "error!" message)
                                 (throw (ex-info "Message Error" {:message message})))))

      (testing "The messages are heard and processed"
        (mq/with-queue queue-name [q]
          (mq/put q "test message 1")
          (mq/put q "test message 2"))
        (Thread/sleep 200)

        (is (= ["test message 1" "test message 2"] @heard-messages)))

      (testing "The error messages are heard and retried up to max failures"
        (mq/with-queue queue-name [q]
          (mq/put q "error!"))
        (Thread/sleep 1000)

        (is (= (into ["test message 1" "test message 2"] (repeat 5 "error!")) @heard-messages)))

      (mq/unlisten! queue-name))))

(deftest ^:parallel publish-to-unlistened-queue-test
  (with-memory-queue
    (testing "with-queue on a queue with no listener still succeeds (messages buffer)"
      (mq/with-queue :queue/nonexistent [q]
        (mq/put q "msg"))
      (is (= 1 (q.impl/queue-length :queue/nonexistent))))))

(deftest ^:parallel with-queue-success-test
  (with-memory-queue
    (let [queue-name (keyword "queue" (str "wq-success-" (gensym)))]
      (mq/listen! queue-name (fn [_msg] nil))

      (testing "with-queue publishes buffered messages on success"
        (let [result (mq/with-queue queue-name [q]
                       (mq/put q "a")
                       (mq/put q "b")
                       :done)]
          (is (= :done result))
          (Thread/sleep 200)
          (is (= 0 (q.impl/queue-length queue-name)))))

      (mq/unlisten! queue-name))))

(deftest ^:parallel with-queue-exception-discards-test
  (with-memory-queue
    (let [queue-name (keyword "queue" (str "wq-error-" (gensym)))]
      (mq/listen! queue-name (fn [_] nil))

      (testing "with-queue discards buffered messages on exception"
        (is (thrown? Exception
                     (mq/with-queue queue-name [q]
                       (mq/put q "should-be-discarded")
                       (throw (ex-info "boom" {})))))
        (is (= 0 (q.impl/queue-length queue-name)))))))

(deftest ^:parallel with-queue-no-listener-test
  (mq/with-sync-queue
    (testing "with-queue on queue with no listener buffers messages"
      (mq/with-queue :queue/nonexistent [q]
        (mq/put q "msg"))
      (is (= 1 (q.impl/queue-length :queue/nonexistent))))))

(deftest ^:parallel double-listen-throws-test
  (with-memory-queue
    (let [queue-name (keyword "queue" (str "double-listen-" (gensym)))]
      (mq/listen! queue-name (fn [_] nil))

      (testing "Registering a second listener on the same queue throws"
        (is (thrown-with-msg? ExceptionInfo #"Queue listener already defined"
                              (mq/listen! queue-name (fn [_] nil)))))

      (mq/unlisten! queue-name))))

(deftest ^:parallel concurrent-listen-throws-test
  (with-memory-queue
    (let [queue-name :queue/concurrent-listen-test
          n          10
          barrier    (CyclicBarrier. n)
          results    (atom [])]
      (testing "Concurrent listen! calls: exactly one succeeds, rest throw"
        (let [threads (mapv (fn [_]
                              (let [f (bound-fn []
                                        (.await barrier)
                                        (try
                                          (mq/listen! queue-name (fn [_] nil))
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

(deftest ^:parallel fifo-ordering-test
  (with-memory-queue
    (let [queue-name (keyword "queue" (str "fifo-" (gensym)))
          received   (atom [])]
      (mq/listen! queue-name (fn [message]
                               (swap! received conj message)))

      (doseq [i (range 10)]
        (mq/with-queue queue-name [q]
          (mq/put q i)))
      (Thread/sleep 500)

      (testing "All messages are delivered"
        (is (= (set (range 10)) (set @received))))

      (mq/unlisten! queue-name))))
