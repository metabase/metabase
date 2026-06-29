(ns metabase.mq.publish-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.transport :as transport]
   [metabase.test.util.dynamic-redefs :refer [with-dynamic-fn-redefs]]))

(set! *warn-on-reflection* true)

(deftest flush-freezes-failed-batch-into-retry-list-test
  (testing "When transport/publish! throws, the batch is frozen into the retry list (not lost) and retried"
    (let [published  (atom [])
          call-count (atom 0)]
      (binding [publish-buffer/*publish-buffer*               (atom {})
                publish-buffer/*publish-retry-batches*        (atom [])
                publish-buffer/*publish-buffer-ms*            0
                publish-buffer/*publish-buffer-max-ms*        0
                ;; zero backoff so the retry is eligible on the immediately-following flush
                publish-buffer/*publish-buffer-retry-base-ms* 0]
        ;; Directly populate the accumulation buffer with an entry past its deadline
        (reset! publish-buffer/*publish-buffer*
                {:queue/test {:messages ["msg1" "msg2"] :deadline-ms 1 :created-ms 1}})
        (with-dynamic-fn-redefs [transport/publish! (fn [channel messages]
                                                      (swap! call-count inc)
                                                      (if (= 1 @call-count)
                                                        (throw (ex-info "publish failed" {}))
                                                        (swap! published conj {:channel channel :messages messages})))]
          ;; First flush — publish throws, batch should move to the retry list
          (publish-buffer/flush-publish-buffer!)
          (testing "Failed batch is off the accumulation buffer and on the retry list"
            (is (empty? @publish-buffer/*publish-buffer*))
            (is (= [{:channel :queue/test :messages ["msg1" "msg2"] :attempts 1}]
                   (mapv #(dissoc % :deadline-ms) @publish-buffer/*publish-retry-batches*))))
          ;; Second flush — retry succeeds
          (publish-buffer/flush-publish-buffer!)
          (testing "Frozen batch is delivered on retry and removed from the retry list"
            (is (= [{:channel :queue/test :messages ["msg1" "msg2"]}] @published))
            (is (empty? @publish-buffer/*publish-retry-batches*))))))))

(deftest flush-drops-messages-after-max-attempts-test
  (testing "A frozen batch is dropped after exceeding max attempts"
    (binding [publish-buffer/*publish-buffer*               (atom {})
              publish-buffer/*publish-retry-batches*        (atom [])
              publish-buffer/*publish-buffer-ms*            0
              publish-buffer/*publish-buffer-max-ms*        0
              publish-buffer/*publish-buffer-max-attempts*  3
              ;; zero backoff so each retry is eligible on the immediately-following flush
              publish-buffer/*publish-buffer-retry-base-ms* 0]
      (with-dynamic-fn-redefs [transport/publish! (fn [_channel _messages]
                                                    (throw (ex-info "always fails" {})))]
        ;; Populate accumulation buffer with messages past their deadline
        (reset! publish-buffer/*publish-buffer*
                {:queue/test {:messages ["msg1" "msg2"] :deadline-ms 1 :created-ms 1}})
        ;; Flush 1: accumulation fails -> attempts=1, frozen
        (publish-buffer/flush-publish-buffer!)
        (is (= 1 (count @publish-buffer/*publish-retry-batches*))
            "Batch frozen after first failure")
        ;; Flush 2: retry fails -> attempts=2, re-frozen
        (publish-buffer/flush-publish-buffer!)
        (is (= [2] (mapv :attempts @publish-buffer/*publish-retry-batches*))
            "Batch re-frozen with incremented attempt count after second failure")
        ;; Flush 3: attempts=3 >= max-attempts=3, dropped
        (publish-buffer/flush-publish-buffer!)
        (is (empty? @publish-buffer/*publish-retry-batches*)
            "Batch dropped after reaching max attempts")))))

(deftest flush-retry-backoff-grows-exponentially-test
  (testing "the backoff helper doubles each attempt and is capped"
    (binding [publish-buffer/*publish-buffer-retry-base-ms* 100
              publish-buffer/*publish-buffer-retry-max-ms*  5000]
      (is (= [100 200 400 800 1600 3200 5000 5000]
             (map #'publish-buffer/flush-retry-backoff-ms (range 1 9))))))
  (testing "each failed flush schedules its retry farther out than the last (exponential backoff)"
    (binding [publish-buffer/*publish-buffer*               (atom {})
              publish-buffer/*publish-retry-batches*        (atom [])
              publish-buffer/*publish-buffer-ms*            0
              publish-buffer/*publish-buffer-max-ms*        0
              publish-buffer/*publish-buffer-retry-base-ms* 1000
              publish-buffer/*publish-buffer-retry-max-ms*  100000]
      (with-dynamic-fn-redefs [transport/publish! (fn [_channel _messages] (throw (ex-info "always fails" {})))]
        (reset! publish-buffer/*publish-buffer*
                {:queue/test {:messages ["m"] :deadline-ms 1 :created-ms 1}})
        ;; first flush moves the batch off accumulation and onto the retry list (retries 1 -> ~1000ms)
        (let [retry-deadline (fn [] (long (:deadline-ms (first @publish-buffer/*publish-retry-batches*))))
              flush-due!
              (fn []
                ;; make the frozen batch due now, flush once (which fails), and return how far out the
                ;; next retry was scheduled relative to the moment of the flush
                (swap! publish-buffer/*publish-retry-batches*
                       (fn [bs] (mapv #(assoc % :deadline-ms 1) bs)))
                (let [t0 (System/currentTimeMillis)]
                  (publish-buffer/flush-publish-buffer!)
                  (- (retry-deadline) t0)))]
          (publish-buffer/flush-publish-buffer!) ; attempts 1 -> ~1000ms
          (let [d2 (flush-due!)                   ; attempts 2 -> ~2000ms
                d3 (flush-due!)]                  ; attempts 3 -> ~4000ms
            (is (<= 2000 d2 2200) "second retry waits ~2x base")
            (is (<= 4000 d3 4200) "third retry waits ~4x base")
            (is (= [3] (mapv :attempts @publish-buffer/*publish-retry-batches*)))))))))

(deftest retry-batch-does-not-merge-with-fresh-accumulation-test
  (testing "Messages that arrive while a batch is retrying accumulate independently — they are NOT
            merged into the retrying batch, so fresh traffic keeps its own window"
    (binding [publish-buffer/*publish-buffer*               (atom {})
              publish-buffer/*publish-retry-batches*        (atom [])
              publish-buffer/*publish-buffer-ms*            100
              publish-buffer/*publish-buffer-max-ms*        0
              publish-buffer/*publish-buffer-retry-base-ms* 100000] ; long backoff: the frozen batch stays put
      ;; A batch past its deadline, whose publish will fail and freeze it.
      (reset! publish-buffer/*publish-buffer*
              {:queue/test {:messages ["old1" "old2"] :deadline-ms 1 :created-ms 1}})
      (with-dynamic-fn-redefs [transport/publish! (fn [_channel _messages]
                                                    ;; new messages arrive during the failing flush
                                                    (swap! publish-buffer/*publish-buffer*
                                                           assoc :queue/test
                                                           {:messages    ["new1"]
                                                            :deadline-ms (+ (System/currentTimeMillis) 100)
                                                            :created-ms  (System/currentTimeMillis)})
                                                    (throw (ex-info "publish failed" {})))]
        (publish-buffer/flush-publish-buffer!)
        (testing "the failed batch is frozen on its own; the fresh messages stay in accumulation"
          (is (= [["old1" "old2"]] (mapv :messages @publish-buffer/*publish-retry-batches*))
              "old messages are frozen as their own retry batch")
          (is (= ["new1"] (get-in @publish-buffer/*publish-buffer* [:queue/test :messages]))
              "new messages accumulate separately, not merged into the retrying batch"))))))

(deftest max-ms-cap-applies-even-while-a-batch-is-retrying-test
  (testing "A channel's accumulation still force-flushes at *publish-buffer-max-ms* even when an
            earlier batch for the same channel is mid-retry (the bug: retries used to disable the cap)"
    (let [published (atom [])]
      (binding [publish-buffer/*publish-buffer*               (atom {})
                ;; a frozen batch already retrying for this channel, far in the future
                publish-buffer/*publish-retry-batches*        (atom [{:channel     :queue/test
                                                                      :messages    ["stuck"]
                                                                      :attempts    1
                                                                      :deadline-ms (+ (System/currentTimeMillis) 1000000)}])
                publish-buffer/*publish-buffer-ms*            100000   ; sliding window never fires on its own
                publish-buffer/*publish-buffer-max-ms*        50]
        ;; an accumulation entry whose created-ms is already older than max-ms
        (reset! publish-buffer/*publish-buffer*
                {:queue/test {:messages    ["fresh"]
                              :deadline-ms (+ (System/currentTimeMillis) 100000)
                              :created-ms  0}})
        (with-dynamic-fn-redefs [transport/publish! (fn [_channel messages]
                                                      (swap! published into messages))]
          (publish-buffer/flush-publish-buffer!)
          (is (= ["fresh"] @published)
              "the accumulation hit its max-ms cap and flushed despite the in-flight retry batch")
          (is (empty? @publish-buffer/*publish-buffer*)))))))
