(ns metabase.util.queue-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.queue :as queue]))

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

(deftest ^:synchronized delay-queue-test
  (let [q           (queue/delay-queue)
        n           5
        batch-size  3
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
          additional-wait (+ extra-delay buffer)]
      (testing "Initially none of the messages are ready"
        (is (nil? (queue/take-delayed-batch! q batch-size))))
      (testing "Polling for a short time will also return before any messages are ready"
        (is (nil? (queue/take-delayed-batch! q batch-size (quot first-delay 2) additional-wait))))
      (testing "Waiting a bit longer, we will retrieve a batch"
        (is (= [0 1 2] (queue/take-delayed-batch! q batch-size (time-until-nth 0) additional-wait))))
      ;; Wait until all items have matured
      (Thread/sleep ^long (time-until-nth n))
      (testing "Some time later we can read an additional batch of messages without any polling delay"
        (is (= [3 4] (queue/take-delayed-batch! q batch-size))))
      (testing "But the outlier is not yet ready"
        (is (nil? (queue/take-delayed-batch! q batch-size))))
      (testing "Eventually the outlier is ready"
        (is (= [10] (queue/take-delayed-batch! q batch-size (time-until-nth 10) additional-wait))))
      (testing "Afterwards the queue is empty"
        (is (nil? (queue/take-delayed-batch! q batch-size)))))))
