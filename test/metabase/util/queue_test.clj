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
        realtime-done (atom false)
        backfill-done (atom false)]
    ;; Backfill thread
    (future
      (doseq [e backfill-events]
        (queue/blocking-put! queue timeout-ms {:thread "back", :payload e}))
      (reset! backfill-done true))
    ;; Realtime threads
    (dotimes [_ realtime-threads]
      (future
        (let [id (rand-int 1000)]
          (doseq [e realtime-events]
            (case (queue/maybe-put! queue {:thread (str "real-" id) :payload e})
              true  (swap! sent inc)
              false (swap! dropped inc)
              nil   (swap! skipped inc)))))
      (reset! realtime-done true))
    ;; Consumer
    (let [processed (atom [])]
      (u/with-timeout timeout-ms
        (try
          ;; Stop the consumer once we are sure that there are no more events coming.
          (while (not (and @realtime-done @backfill-done))
            (swap! processed conj (:payload (queue/blocking-take! queue timeout-ms)))
            ;; Sleep to provide some backpressure
            (Thread/sleep 1))
          (catch Exception _)))
      {:processed @processed
       :sent      @sent
       :dropped   @dropped
       :skipped   @skipped})))

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

(deftest ^:synchronized same-deadline-take-batch-is-fifo-test
  (testing "messages that mature together come off in the order they were put on"
    ;; Consumers that queue a removal after an update rely on this: comparing only on the remaining delay
    ;; leaves same-millisecond messages in whatever order the heap happens to hold them.
    (let [q (queue/delay-queue)
          n 50]
      (dotimes [i n]
        (queue/put-with-delay! q 0 i))
      (is (= (range n) (#'queue/take-batch! q 100 n 10))))))

(deftest non-delayed-take-batch-test
  (testing "take-batch works with any blocking queue"
    (let [q (LinkedBlockingQueue.)
          n 5]
      (dotimes [i n]
        (.offer q i))
      (is (= [0 1 2] (#'queue/take-batch! q 500 3 10)))
      (is (= [3 4] (#'queue/take-batch! q 500 3 10))))))
