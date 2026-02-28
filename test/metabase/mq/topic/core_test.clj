(ns metabase.mq.topic.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.topic.test-util :as tpt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel e2e-publish-subscribe-test
  (tpt/with-memory-topics
    (let [received (atom [])]
      (mq/subscribe! :topic/e2e
                     (fn [{:keys [message]}]
                       (swap! received conj message)))

      (testing "Messages are received by subscriber"
        (mq/publish! :topic/e2e ["message-1"])
        (mq/publish! :topic/e2e ["message-2"])
        (Thread/sleep 200)
        (is (= ["message-1" "message-2"] @received)))

      (testing "Unsubscribe stops delivery"
        (mq/unsubscribe! :topic/e2e)
        (mq/publish! :topic/e2e ["message-3"])
        (Thread/sleep 200)
        (is (= ["message-1" "message-2"] @received))))))

(deftest ^:parallel batch-publish-e2e-test
  (tpt/with-memory-topics
    (let [received (atom [])]
      (mq/subscribe! :topic/batch
                     (fn [{:keys [message]}]
                       (swap! received conj message)))

      (mq/publish! :topic/batch ["a" "b" "c"])
      (Thread/sleep 200)

      (testing "Batch of messages delivered together"
        (is (= ["a" "b" "c"] @received)))

      (mq/unsubscribe! :topic/batch))))

(deftest ^:parallel error-handling-e2e-test
  (tpt/with-memory-topics
    (let [received (atom [])]
      (mq/subscribe! :topic/errors
                     (fn [{:keys [message]}]
                       (when (= "fail" message)
                         (throw (ex-info "Handler error" {})))
                       (swap! received conj message)))

      (mq/publish! :topic/errors ["ok-1"])
      (mq/publish! :topic/errors ["fail"])
      (mq/publish! :topic/errors ["ok-2"])
      (Thread/sleep 200)

      (testing "Non-error messages are delivered"
        (is (= ["ok-1" "ok-2"] @received)))

      (mq/unsubscribe! :topic/errors))))

(deftest ^:parallel late-subscriber-test
  (tpt/with-memory-topics
    (mq/publish! :topic/late ["old-message"])

    (let [received (atom [])]
      (mq/subscribe! :topic/late
                     (fn [{:keys [message]}]
                       (swap! received conj message)))

      (mq/publish! :topic/late ["new-message"])
      (Thread/sleep 200)

      (testing "Late subscriber only sees new messages"
        (is (= ["new-message"] @received)))

      (mq/unsubscribe! :topic/late))))
