(ns metabase.mq.topic.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.test-util :as mq.tu])
  (:import (clojure.lang ExceptionInfo)
           (java.util.concurrent CyclicBarrier)))

(set! *warn-on-reflection* true)

(deftest e2e-publish-subscribe-test
  (mq.tu/with-sync-mq
    (let [received (atom [])]
      (mq/listen! :topic/e2e {}
                  (fn [message]
                    (swap! received conj message)))

      (testing "Messages are received by subscriber"
        (mq/with-topic :topic/e2e [t]
          (mq/put t "message-1"))
        (mq/with-topic :topic/e2e [t]
          (mq/put t "message-2"))
        (is (= ["message-1" "message-2"] @received)))

      (testing "Unsubscribe stops delivery"
        (mq/unlisten! :topic/e2e)
        (mq/with-topic :topic/e2e [t]
          (mq/put t "message-3"))
        (is (= ["message-1" "message-2"] @received))))))

(deftest batch-publish-e2e-test
  (mq.tu/with-sync-mq
    (let [received (atom [])]
      (mq/listen! :topic/batch {}
                  (fn [message]
                    (swap! received conj message)))

      (mq/with-topic :topic/batch [t]
        (mq/put t "a")
        (mq/put t "b")
        (mq/put t "c"))

      (testing "Batch of messages delivered together"
        (is (= ["a" "b" "c"] @received)))

      (mq/unlisten! :topic/batch))))

(deftest error-handling-e2e-test
  (mq.tu/with-sync-mq
    (let [received (atom [])]
      (mq/listen! :topic/errors {}
                  (fn [message]
                    (when (= "fail" message)
                      (throw (ex-info "Handler error" {})))
                    (swap! received conj message)))

      (mq/with-topic :topic/errors [t]
        (mq/put t "ok-1"))
      (mq/with-topic :topic/errors [t]
        (mq/put t "fail"))
      (mq/with-topic :topic/errors [t]
        (mq/put t "ok-2"))

      (testing "Non-error messages are delivered"
        (is (= ["ok-1" "ok-2"] @received)))

      (mq/unlisten! :topic/errors))))

(deftest batch-partial-failure-test
  (testing "When listener throws on one message in a batch, remaining messages are still delivered"
    (mq.tu/with-sync-mq
      (let [received (atom [])]
        (mq/listen! :topic/batch-fail {}
                    (fn [message]
                      (when (= "boom" message)
                        (throw (ex-info "Handler error" {})))
                      (swap! received conj message)))

        (mq/with-topic :topic/batch-fail [t]
          (mq/put t "msg-1")
          (mq/put t "boom")
          (mq/put t "msg-3")
          (mq/put t "msg-4"))

        (is (= ["msg-1" "msg-3" "msg-4"] @received))

        (mq/unlisten! :topic/batch-fail)))))

(deftest concurrent-subscribe-throws-test
  (mq.tu/with-sync-mq
    (let [topic-name :topic/concurrent-sub-test
          n          10
          barrier    (CyclicBarrier. n)
          results    (atom [])]
      (testing "Concurrent listen! calls: exactly one succeeds, rest throw"
        (let [threads (mapv (fn [_]
                              (let [f (bound-fn []
                                        (.await barrier)
                                        (try
                                          (mq.impl/listen! topic-name {} (fn [_] nil))
                                          (swap! results conj :ok)
                                          (catch ExceptionInfo _
                                            (swap! results conj :error))))]
                                (Thread. ^Runnable f)))
                            (range n))]
          (run! (fn [^Thread t] (.start t)) threads)
          (run! (fn [^Thread t] (.join t 5000)) threads)
          (is (= 1 (count (filter #{:ok} @results))))
          (is (= (dec n) (count (filter #{:error} @results))))))
      (mq/unlisten! topic-name))))

(deftest late-subscriber-test
  (mq.tu/with-sync-mq
    (mq/with-topic :topic/late [t]
      (mq/put t "old-message"))

    (let [received (atom [])]
      (mq/listen! :topic/late {}
                  (fn [message]
                    (swap! received conj message)))

      (mq/with-topic :topic/late [t]
        (mq/put t "new-message"))

      (testing "Late subscriber only sees new messages"
        (is (= ["new-message"] @received)))

      (mq/unlisten! :topic/late))))
