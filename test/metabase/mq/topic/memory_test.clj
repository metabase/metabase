(ns metabase.mq.topic.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.mq.topic.test-util :as tpt])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel publish-and-subscribe-test
  (tpt/with-memory-topics
    (let [received (atom [])]
      (topic.impl/subscribe! :topic/test
                             (fn [{:keys [message]}]
                               (swap! received conj message)))
      (topic.impl/publish! :topic/test ["hello"])
      (topic.impl/publish! :topic/test ["world"])
      (Thread/sleep 200)

      (testing "Subscriber receives published messages"
        (is (= ["hello" "world"] @received)))

      (topic.impl/unsubscribe! :topic/test))))

(deftest ^:parallel batch-publish-test
  (tpt/with-memory-topics
    (let [received (atom [])]
      (topic.impl/subscribe! :topic/batch
                             (fn [{:keys [message]}]
                               (swap! received conj message)))
      (topic.impl/publish! :topic/batch ["msg-1" "msg-2" "msg-3"])
      (Thread/sleep 200)

      (testing "Batch of messages received in one row"
        (is (= ["msg-1" "msg-2" "msg-3"] @received)))

      (topic.impl/unsubscribe! :topic/batch))))

(deftest ^:parallel subscribe-only-sees-new-messages-test
  (tpt/with-memory-topics
    (topic.backend/publish! :topic.backend/memory :topic/late-join ["before-subscribe"])
    (let [received (atom [])]
      (topic.impl/subscribe! :topic/late-join
                             (fn [{:keys [message]}]
                               (swap! received conj message)))

      (topic.impl/publish! :topic/late-join ["after-subscribe"])
      (Thread/sleep 200)

      (testing "Subscriber only sees messages published after subscribing"
        (is (= ["after-subscribe"] @received)))

      (topic.impl/unsubscribe! :topic/late-join))))

(deftest ^:parallel unsubscribe-stops-delivery-test
  (tpt/with-memory-topics
    (let [received (atom [])]
      (topic.impl/subscribe! :topic/unsub
                             (fn [{:keys [message]}]
                               (swap! received conj message)))

      (topic.impl/publish! :topic/unsub ["before"])
      (Thread/sleep 200)
      (is (= ["before"] @received))

      (topic.impl/unsubscribe! :topic/unsub)

      (topic.backend/publish! :topic.backend/memory :topic/unsub ["after"])
      (Thread/sleep 200)

      (testing "No messages received after unsubscribe"
        (is (= ["before"] @received))))))

(deftest ^:parallel error-handling-test
  (tpt/with-memory-topics
    (let [received (atom [])]
      (topic.impl/subscribe! :topic/errors
                             (fn [{:keys [message]}]
                               (when (= "error!" message)
                                 (throw (ex-info "Test error" {})))
                               (swap! received conj message)))

      (topic.impl/publish! :topic/errors ["good"])
      (topic.impl/publish! :topic/errors ["error!"])
      (topic.impl/publish! :topic/errors ["also-good"])
      (Thread/sleep 200)

      (testing "Good messages are received"
        (is (= ["good" "also-good"] @received)))

      (topic.impl/unsubscribe! :topic/errors))))

(deftest ^:parallel double-subscribe-throws-test
  (tpt/with-memory-topics
    (topic.impl/subscribe! :topic/double (fn [_] nil))
    (testing "Subscribing twice to the same topic throws"
      (is (thrown-with-msg? ExceptionInfo #"Handler already registered"
                            (topic.impl/subscribe! :topic/double (fn [_] nil)))))
    (topic.impl/unsubscribe! :topic/double)))

(deftest ^:parallel topic-isolation-test
  (tpt/with-memory-topics
    (let [received-a (atom [])
          received-b (atom [])]
      (topic.impl/subscribe! :topic/isolated-a
                             (fn [{:keys [message]}]
                               (swap! received-a conj message)))
      (topic.impl/subscribe! :topic/isolated-b
                             (fn [{:keys [message]}]
                               (swap! received-b conj message)))

      (topic.impl/publish! :topic/isolated-a ["for-a"])
      (topic.impl/publish! :topic/isolated-b ["for-b"])
      (Thread/sleep 200)

      (testing "Messages on topic A don't appear on topic B"
        (is (= ["for-a"] @received-a))
        (is (= ["for-b"] @received-b)))

      (topic.impl/unsubscribe! :topic/isolated-a)
      (topic.impl/unsubscribe! :topic/isolated-b))))
