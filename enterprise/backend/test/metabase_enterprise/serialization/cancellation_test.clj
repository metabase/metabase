(ns metabase-enterprise.serialization.cancellation-test
  "Tests that serialization respects thread interruption for request cancellation.
   
   This addresses GitHub issue #46727 where serialization continued running
   even after HTTP request was cancelled."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest export-respects-thread-interruption-test
  (testing "Export stops early when thread is interrupted (simulates cancelled HTTP request)"
    (let [items-processed (atom 0)
          ;; Create a mock stream that tracks processing and interrupts after first item
          mock-stream (reify clojure.lang.IReduceInit
                        (reduce [_ f init]
                          (reduce (fn [acc i]
                                    (swap! items-processed inc)
                                    ;; Interrupt after processing first item to simulate request cancellation
                                    (when (= i 1)
                                      (.interrupt (Thread/currentThread)))
                                    (f acc {:serdes/meta [{:model "Setting"}]
                                            :key (str "test-key-" i)
                                            :value "test-value"}))
                                  init
                                  (range 100))))]
      (mt/with-temp-dir [dir]
        ;; Clear any existing interrupt flag
        (Thread/interrupted)
        (is (thrown? InterruptedException
                     (storage/store! mock-stream (str dir))))
        ;; Should have stopped very early - processed only a few items before detecting interrupt
        (is (< @items-processed 10)
            (format "Expected serialization to stop early after interruption, but processed %d items"
                    @items-processed))
        ;; Clear the interrupt flag for subsequent tests
        (Thread/interrupted)))))

(deftest export-completes-normally-without-interruption-test
  (testing "Export completes normally when thread is not interrupted"
    (let [items-processed (atom 0)
          mock-stream (reify clojure.lang.IReduceInit
                        (reduce [_ f init]
                          (reduce (fn [acc i]
                                    (swap! items-processed inc)
                                    (f acc {:serdes/meta [{:model "Setting"}]
                                            :key (str "test-key-" i)
                                            :value "test-value"}))
                                  init
                                  (range 10))))]
      (mt/with-temp-dir [dir]
        ;; Clear any existing interrupt flag
        (Thread/interrupted)
        (let [report (storage/store! mock-stream (str dir))]
          ;; Should complete all items
          (is (= 10 @items-processed)
              "Expected all items to be processed")
          ;; Settings are batched together
          (is (= 1 (count (:seen report)))
              "Expected settings to be stored"))))))
