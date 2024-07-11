(ns metabase.util.queue-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util :as u]
   [metabase.util.queue :as queue])
  (:import
   (java.util Set)
   (metabase.util.queue DeduplicatingArrayTransactionQueue)))

(set! *warn-on-reflection* true)

(deftest deduplicateing-bounded-blocking-queue-test
  (let [capacity         10
        q                (queue/bounded-transfer-queue capacity :sleep-ms 10 :block-ms 10 :dedupe? true)
        realtime-threads 5
        n-real           300
        n-back           10000
        dropped          (volatile! 0)
        realtime-fn      (fn []
                           (let [id (rand-int 1000)]
                             (dotimes [i n-real]
                            ;; Enqueue realtime events from newest to oldest
                               (let [payload (- (dec n-back) i)]
                                 (when-not (queue/maybePut! q {:thread (str "real-" id) :payload payload})
                                   (vswap! dropped inc)))
                               (Thread/sleep 1))))
        background-fn    (fn []
                           (dotimes [i n-back]
                          ;; Enqueue background events from oldest to newest
                             (queue/blockingPut! q {:thread "back", :payload i})))
        run!             (fn [f]
                           (future (f)))]

    (run! background-fn)
    (future
      (dotimes [i realtime-threads]
        ;; Stagger out when the realtime threads start
        (Thread/sleep ^long (* 100 i))
        (run! realtime-fn)))

    (let [processed (volatile! [])]
      (try
        (while true
          ;; Stop the consumer once we are sure that there are no more events coming.
          (u/with-timeout 100
            (vswap! processed conj (:payload (queue/blockingTake! q)))))
        (testing "This is never reached"
          (is false))
        (catch Exception _
          (testing "We processed at least as many events as guaranteed"
            (is (>= (count @processed) (+ n-back capacity))))
          (testing "Some items are dropped"
            (is (pos? @dropped)))
          (testing "Some items are deduplicated"
            (is (< (count @processed) (+ n-back (* realtime-threads n-real)))))
          (testing "Every item is processed"
            (is (= (set (range n-back)) (set @processed))))
          (testing "No phantom items are left in the set"
            (is (zero? (.size ^Set (.-queued-set ^DeduplicatingArrayTransactionQueue q))))))))))
