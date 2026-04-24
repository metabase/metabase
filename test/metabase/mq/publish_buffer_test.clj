(ns metabase.mq.publish-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.transport :as transport]))

(set! *warn-on-reflection* true)

(deftest flush-re-buffers-on-failure-test
  (testing "When transport/publish! throws, messages are re-buffered (not lost)"
    (let [published (atom [])
          call-count (atom 0)]
      (binding [publish-buffer/*publish-buffer* (atom {})
                publish-buffer/*publish-buffer-ms* 0
                publish-buffer/*publish-buffer-max-ms* 0]
        ;; Directly populate the buffer with an entry past its deadline
        (reset! publish-buffer/*publish-buffer*
                {:queue/test {:messages ["msg1" "msg2"]
                              :deadline-ms 1
                              :created-ms 1}})
        (with-redefs [transport/publish! (fn [channel messages]
                                           (swap! call-count inc)
                                           (if (= 1 @call-count)
                                             (throw (ex-info "publish failed" {}))
                                             (swap! published conj {:channel channel :messages messages})))]
          ;; First flush — publish throws, messages should be re-buffered
          (publish-buffer/flush-publish-buffer!)
          (testing "Messages are back in the buffer after failure"
            (is (contains? @publish-buffer/*publish-buffer* :queue/test))
            (is (= ["msg1" "msg2"]
                   (get-in @publish-buffer/*publish-buffer* [:queue/test :messages]))))

          ;; Second flush — publish succeeds
          (publish-buffer/flush-publish-buffer!)
          (testing "Messages are delivered on retry"
            (is (= [{:channel :queue/test :messages ["msg1" "msg2"]}] @published))
            (is (empty? @publish-buffer/*publish-buffer*))))))))

(deftest flush-drops-messages-after-max-retries-test
  (testing "Messages are dropped after exceeding max retries"
    (binding [publish-buffer/*publish-buffer*             (atom {})
              publish-buffer/*publish-buffer-ms*          0
              publish-buffer/*publish-buffer-max-ms*      0
              publish-buffer/*publish-buffer-max-retries* 3]
      (with-redefs [transport/publish! (fn [_channel _messages]
                                         (throw (ex-info "always fails" {})))]
        ;; Populate buffer with messages past their deadline
        (reset! publish-buffer/*publish-buffer*
                {:queue/test {:messages   ["msg1" "msg2"]
                              :deadline-ms 1
                              :created-ms  1
                              :retries     0}})
        ;; Flush 1: retries=1, re-buffered
        (publish-buffer/flush-publish-buffer!)
        (is (contains? @publish-buffer/*publish-buffer* :queue/test)
            "Messages should be re-buffered after first failure")

        ;; Flush 2: retries=2, re-buffered
        (publish-buffer/flush-publish-buffer!)
        (is (contains? @publish-buffer/*publish-buffer* :queue/test)
            "Messages should be re-buffered after second failure")

        ;; Flush 3: retries=3 >= max-retries=3, dropped
        (publish-buffer/flush-publish-buffer!)
        (is (empty? @publish-buffer/*publish-buffer*)
            "Messages should be dropped after reaching max retries")))))

(deftest flush-re-buffer-merges-with-new-messages-test
  (testing "Re-buffered messages merge with new messages that arrived during flush"
    (binding [publish-buffer/*publish-buffer* (atom {})
              publish-buffer/*publish-buffer-ms* 100
              publish-buffer/*publish-buffer-max-ms* 0]
      ;; Populate buffer with messages past deadline
      (reset! publish-buffer/*publish-buffer*
              {:queue/test {:messages ["old1" "old2"]
                            :deadline-ms 1
                            :created-ms 1}})
      (with-redefs [transport/publish! (fn [_channel _messages]
                                         ;; Simulate new messages arriving during flush
                                         (swap! publish-buffer/*publish-buffer*
                                                assoc :queue/test
                                                {:messages ["new1"]
                                                 :deadline-ms (+ (System/currentTimeMillis) 100)
                                                 :created-ms (System/currentTimeMillis)})
                                         (throw (ex-info "publish failed" {})))]
        (publish-buffer/flush-publish-buffer!)
        (testing "Re-buffered messages are merged with new messages"
          (let [messages (get-in @publish-buffer/*publish-buffer* [:queue/test :messages])]
            (is (= ["new1" "old1" "old2"] messages))))))))
