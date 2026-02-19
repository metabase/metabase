(ns metabase.util.queue-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.queue :as queue])
  (:import (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(def ^:private timeout-ms 5000)

(defn- simulate-queue! [queue &
                        {:keys [realtime-threads realtime-events backfill-events]
                         :or   {realtime-threads 5}}]
  (let [sent          (atom 0)
        dropped       (atom 0)
        skipped       (atom 0)
        realtime-fn   (fn []
                        (let [id (rand-int 1000)]
                          (doseq [e realtime-events]
                            (case (queue/maybe-put! queue {:thread (str "real-" id) :payload e})
                              true  (swap! sent inc)
                              false (swap! dropped inc)
                              nil   (swap! skipped inc)))))
        background-fn (fn []
                        (doseq [e backfill-events]
                          (queue/blocking-put! queue timeout-ms {:thread "back", :payload e})))
        run!          (fn [f]
                        (future (f)))]

    (run! background-fn)
    (future
      (dotimes [_ realtime-threads]
        (run! realtime-fn)))

    (let [processed (volatile! [])]
      (try
        (while true
          ;; Stop the consumer once we are sure that there are no more events coming.
          (u/with-timeout timeout-ms
            (vswap! processed conj (:payload (queue/blocking-take! queue timeout-ms)))
            ;; Sleep to provide some backpressure
            (Thread/sleep 1)))
        (assert false "this is never reached")
        (catch Exception _
          {:processed @processed
           :sent      @sent
           :dropped   @dropped
           :skipped   @skipped})))))

(deftest bounded-transfer-queue-test
  (let [realtime-event-count 500
        backfill-event-count 1000
        capacity             (- realtime-event-count 100)
        ;; Enqueue background events from oldest to newest
        backfill-events      (range backfill-event-count)
        ;; Enqueue realtime events from newest to oldest
        realtime-events      (take realtime-event-count (reverse backfill-events))
        queue                (queue/bounded-transfer-queue capacity :sleep-ms 10 :block-ms 10)

        {:keys [processed sent dropped skipped] :as _result}
        (simulate-queue! queue
                         :backfill-events backfill-events
                         :realtime-events realtime-events)]

    (testing "We processed all the events that were enqueued"
      (is (= (+ (count backfill-events) sent)
             (count processed))))

    (testing "No items are skipped"
      (is (zero? skipped)))

    (testing "Some items are dropped"
      (is (pos? dropped)))

    (let [expected-events  (set (concat backfill-events realtime-events))
          processed-events (set processed)]
      (testing "All expected events are processed"
        (is (zero? (count (set/difference expected-events processed-events)))))
      (testing "There are no unexpected events processed"
        (is (zero? (count (set/difference processed-events expected-events))))))

    (testing "The realtime events are processed in order"
      (mt/ordered-subset? realtime-events processed))))

(deftest ^:synchronized take-batch-test
  (let [q           (queue/delay-queue)
        n           5
        first-delay 300
        extra-delay 200
        buffer      50
        msg-delay   #(+ first-delay (* extra-delay %))]
    (dotimes [i n]
      (queue/put-with-delay! q (msg-delay i) i))
    ;; queue an outlier
    (queue/put-with-delay! q (msg-delay 10) 10)
    (let [started-roughly (u/start-timer)
          since-start     #(u/since-ms started-roughly)
          time-until-nth  #(max 0 (+ buffer (- (msg-delay %) (since-start))))
          take-batch-wait-ms (time-until-nth 10)]
      (testing "Polling for a short initial time will return before any messages are ready, regardless the max-next-ms"
        (is (nil? (#'queue/take-batch! q 10 100 5000))))
      (testing "With a long max-first-ms and max-next-ms, we limit by the max-batch-messages"
        (is (= [0 1 2] (#'queue/take-batch! q take-batch-wait-ms 3 (time-until-nth 3)))))
      (testing "Some time later we can read an additional batch of messages without any polling delay"
        (Thread/sleep ^long (time-until-nth n))
        ;; Wait until all items have matured
        (is (= [3 4] (#'queue/take-batch! q 0 5 0))))
      (testing "But the outlier is not yet ready"
        (is (nil? (#'queue/take-batch! q 0 5 0))))
      (testing "Eventually the outlier is ready"
        (is (= [10] (#'queue/take-batch! q take-batch-wait-ms 5 50))))
      (testing "Afterwards the queue is empty"
        (is (nil? (#'queue/take-batch! q take-batch-wait-ms 5 0)))))))

(deftest non-delayed-take-batch-test
  (testing "take-batch works with any blocking queue"
    (let [q (LinkedBlockingQueue.)
          n 5]
      (dotimes [i n]
        (.offer q i))
      (is (= [0 1 2] (#'queue/take-batch! q 500 3 10)))
      (is (= [3 4] (#'queue/take-batch! q 500 3 10))))))

(defn- thread-name-running? [name]
  (some #(= name (.getName ^Thread %)) (keys (Thread/getAllStackTraces))))

(defmacro ^:private await-test-while
  "Wait 100 times 10 milliseconds or until `delay-condition` becomes false and evaluate `body`.
  Reaching 100 tries results in the test failing."
  {:style/indent 1}
  [delay-condition & body]
  ;; make tries and the sleep time macro parameters if needed
  `(loop [tries# 100]
     (Thread/sleep 10)
     (cond
       (zero? tries#)   (is false "Max waiting time exceeded")
       ~delay-condition (recur (dec tries#))
       :else            (do ~@body))))

(deftest listener-handler-test
  (testing "Standard behavior with a handler"
    (let [listener-name "test-listener"
          items-handled (atom 0)
          last-batch (atom nil)
          queue (queue/delay-queue)
          thread-name "queue-test-listener-0"]
      (is (not (thread-name-running? thread-name)))
      (is (not (queue/listener-exists? listener-name)))

      (queue/listen! listener-name queue
                     (fn [batch] (swap! items-handled + (count batch)) (reset! last-batch batch))
                     {:max-next-ms 5})
      (is (thread-name-running? thread-name))
      (is (queue/listener-exists? listener-name))

      (is (nil? (queue/listen! listener-name queue
                               (fn [batch] (throw (ex-info "Second listener with the same name cannot be created" {:batch batch})))
                               {:max-next-ms 5})))
      (try
        (queue/put-with-delay! queue 0 "a")
        (await-test-while (zero? @items-handled)
          (is (= 1 @items-handled))
          (is (= ["a"] @last-batch)))

        (queue/put-with-delay! queue 0 "b")
        (queue/put-with-delay! queue 0 "c")
        (queue/put-with-delay! queue 0 "d")
        (await-test-while (< @items-handled 4)
          (is (= 4 @items-handled))
          (is (some #{"d"} @last-batch)))

        (finally
          (queue/stop-listening! listener-name)))

      (await-test-while (thread-name-running? thread-name))
      (is (not (queue/listener-exists? listener-name)))

      ; additional calls to stop are no-ops
      (is (nil? (queue/stop-listening! listener-name))))))

(deftest result-listener-test
  (testing "When result and error handlers are defined, they are called correctly"
    (let [listener-name "test-result-listener"
          queue (queue/delay-queue)
          result-count (atom 0)
          error-count (atom 0)
          last-error (atom nil)]
      (queue/listen! listener-name queue
                     (fn [batch]
                       (if (some #{"err"} batch)
                         (throw (ex-info "Test Error" {:batch batch}))
                         (count batch)))
                     {:success-handler (fn [result duration name]
                                         (is (= listener-name name))
                                         (is (< 0 duration))
                                         (swap! result-count + result))
                      :err-handler     (fn [e _] (swap! error-count inc) (reset! last-error e))
                      :max-next-ms    5})
      (try
        (queue/put-with-delay! queue 0 "a")
        (await-test-while (zero? @result-count)
          (is (= 0 @error-count))
          (is (= 1 @result-count)))

        (queue/put-with-delay! queue 0 "err")
        (await-test-while (zero? @error-count)
          (is (= 1 @error-count))
          (is (= 1 @result-count))
          (is (= "Test Error" (.getMessage ^Exception @last-error))))

        (finally
          (queue/stop-listening! listener-name))))))

(deftest multithreaded-listener-test
  (testing "Test behavior with a multithreaded listener"
    (let [listener-name "test-multithreaded-listener"
          thread-name-0 (str "queue-" listener-name "-0")
          thread-name-1 (str "queue-" listener-name "-1")
          thread-name-2 (str "queue-" listener-name "-2")
          batches-handled (atom 0)
          handlers-used (atom #{})
          queue (queue/delay-queue)]
      (is (not (thread-name-running? thread-name-0)))
      (is (not (thread-name-running? thread-name-1)))
      (is (not (thread-name-running? thread-name-2)))

      (queue/listen! listener-name
                     queue
                     (fn [batch] (is (<= (count batch) 10)) (count batch))
                     {:success-handler    (fn [result _ name] (swap! batches-handled + result) (swap! handlers-used conj name))
                      :pool-size          3
                      :max-batch-messages 10
                      :max-next-ms        5})
      (try
        (is (thread-name-running? thread-name-0))
        (is (thread-name-running? thread-name-1))
        (is (thread-name-running? thread-name-2))

        (dotimes [i 100]
          (queue/put-with-delay! queue 0 i))

        (await-test-while (< @batches-handled 100)
          (is (= 100 @batches-handled))
          (is (contains? @handlers-used listener-name)))

        (finally
          (queue/stop-listening! listener-name)))
      (await-test-while (or (thread-name-running? thread-name-0)
                            (thread-name-running? thread-name-1)
                            (thread-name-running? thread-name-2))))))

(deftest error-resilience-test
  (testing "An AssertionError thrown by the handler does not kill the listener thread"
    (let [listener-name "test-error-resilience"
          thread-name   "queue-test-error-resilience-0"
          call-count    (atom 0)
          queue         (queue/delay-queue)]
      (queue/listen! listener-name queue
                     (fn [batch]
                       (swap! call-count inc)
                       (when (some #{"boom"} batch)
                         (throw (AssertionError. "simulated assertion error")))
                       (count batch))
                     {:max-next-ms 5})
      (try
        ;; First message triggers AssertionError
        (queue/put-with-delay! queue 0 "boom")
        (await-test-while (zero? @call-count)
          (is (= 1 @call-count)))

        ;; Thread should still be alive
        (is (thread-name-running? thread-name)
            "Listener thread should survive an AssertionError")

        ;; Second message should still be processed
        (queue/put-with-delay! queue 0 "ok")
        (await-test-while (< @call-count 2)
          (is (= 2 @call-count)))

        (finally
          (queue/stop-listening! listener-name))))))

(deftest restart-after-err-handler-failure-test
  (testing "Listener restarts when err-handler itself throws an Error"
    (let [listener-name   "test-restart-on-err-handler"
          thread-name     "queue-test-restart-on-err-handler-0"
          call-count      (atom 0)
          err-handler-ran (atom false)
          queue           (queue/delay-queue)]
      (queue/listen! listener-name queue
                     (fn [batch]
                       (swap! call-count inc)
                       (when (some #{"fail"} batch)
                         (throw (Exception. "handler exception")))
                       (count batch))
                     {:err-handler  (fn [_e _name]
                                      (reset! err-handler-ran true)
                                      ;; err-handler itself throws an Error, escaping the inner catch
                                      (throw (AssertionError. "err-handler assertion error")))
                      :max-next-ms 5})
      (try
        ;; First message triggers the handler exception -> err-handler -> AssertionError
        ;; This escapes listener-thread's inner catch, but listener-thread-with-restart should restart it
        (queue/put-with-delay! queue 0 "fail")
        (await-test-while (not @err-handler-ran)
          (is @err-handler-ran))

        ;; Wait for restart backoff (initial-restart-backoff-ms = 500ms) plus margin
        (Thread/sleep 1000)

        ;; Thread should be alive again after restart
        (is (thread-name-running? thread-name)
            "Listener thread should restart after err-handler throws an Error")

        ;; Verify second message is processed normally
        (queue/put-with-delay! queue 0 "ok")
        (await-test-while (< @call-count 2)
          (is (= 2 @call-count)))

        (finally
          (queue/stop-listening! listener-name))))))
