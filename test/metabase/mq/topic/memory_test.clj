(ns metabase.mq.topic.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.topic.backend :as tp.backend]
   [metabase.mq.topic.impl :as tp.impl]
   [metabase.mq.topic.test-util :as tpt])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel publish-and-subscribe-test
  (tpt/with-memory-topics [recent]
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/tracking :topic/test
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))
      (tp.backend/publish! :topic.backend/tracking :topic/test ["hello"])
      (tp.backend/publish! :topic.backend/tracking :topic/test ["world"])
      (Thread/sleep 200)

      (testing "Subscriber receives published messages"
        (is (= ["hello" "world"] @received)))

      (testing "Published messages are tracked"
        (is (= 2 (count @(:published-messages recent)))))

      (testing "Received messages are tracked"
        (is (= 2 (count @(:received-messages recent)))))

      (tp.backend/unsubscribe! :topic.backend/tracking :topic/test))))

(deftest ^:parallel batch-publish-test
  (tpt/with-memory-topics [_recent]
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/memory :topic/batch
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))
      (tp.backend/publish! :topic.backend/memory :topic/batch ["msg-1" "msg-2" "msg-3"])
      (Thread/sleep 200)

      (testing "Batch of messages received in one row"
        (is (= ["msg-1" "msg-2" "msg-3"] @received)))

      (tp.backend/unsubscribe! :topic.backend/memory :topic/batch))))

(deftest ^:parallel subscribe-only-sees-new-messages-test
  (tpt/with-memory-topics [_recent]
    (tp.backend/publish! :topic.backend/memory :topic/late-join ["before-subscribe"])
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/memory :topic/late-join
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))

      (tp.backend/publish! :topic.backend/memory :topic/late-join ["after-subscribe"])
      (Thread/sleep 200)

      (testing "Subscriber only sees messages published after subscribing"
        (is (= ["after-subscribe"] @received)))

      (tp.backend/unsubscribe! :topic.backend/memory :topic/late-join))))

(deftest ^:parallel unsubscribe-stops-delivery-test
  (tpt/with-memory-topics [_recent]
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/memory :topic/unsub
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))

      (tp.backend/publish! :topic.backend/memory :topic/unsub ["before"])
      (Thread/sleep 200)
      (is (= ["before"] @received))

      (tp.backend/unsubscribe! :topic.backend/memory :topic/unsub)

      (tp.backend/publish! :topic.backend/memory :topic/unsub ["after"])
      (Thread/sleep 200)

      (testing "No messages received after unsubscribe"
        (is (= ["before"] @received))))))

(deftest ^:parallel error-handling-test
  (tpt/with-memory-topics [recent]
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/tracking :topic/errors
                             (fn [{:keys [messages]}]
                               (when (= ["error!"] messages)
                                 (throw (ex-info "Test error" {})))
                               (swap! received into messages)))

      (tp.backend/publish! :topic.backend/tracking :topic/errors ["good"])
      (tp.backend/publish! :topic.backend/tracking :topic/errors ["error!"])
      (tp.backend/publish! :topic.backend/tracking :topic/errors ["also-good"])
      (Thread/sleep 200)

      (testing "Good messages are received"
        (is (= ["good" "also-good"] @received)))

      (testing "Errors are tracked"
        (is (= 1 (count @(:errors recent)))))

      (tp.backend/unsubscribe! :topic.backend/tracking :topic/errors))))

(deftest ^:parallel double-subscribe-throws-test
  (tpt/with-memory-topics [_recent]
    (tp.impl/subscribe! :topic/double (fn [_] nil))
    (testing "Subscribing twice to the same topic throws"
      (is (thrown-with-msg? ExceptionInfo #"Handler already registered"
                            (tp.impl/subscribe! :topic/double (fn [_] nil)))))
    (tp.impl/unsubscribe! :topic/double)))

(deftest ^:parallel topic-isolation-test
  (tpt/with-memory-topics [_recent]
    (let [received-a (atom [])
          received-b (atom [])]
      (tp.backend/subscribe! :topic.backend/memory :topic/isolated-a
                             (fn [{:keys [messages]}]
                               (swap! received-a into messages)))
      (tp.backend/subscribe! :topic.backend/memory :topic/isolated-b
                             (fn [{:keys [messages]}]
                               (swap! received-b into messages)))

      (tp.backend/publish! :topic.backend/memory :topic/isolated-a ["for-a"])
      (tp.backend/publish! :topic.backend/memory :topic/isolated-b ["for-b"])
      (Thread/sleep 200)

      (testing "Messages on topic A don't appear on topic B"
        (is (= ["for-a"] @received-a))
        (is (= ["for-b"] @received-b)))

      (tp.backend/unsubscribe! :topic.backend/memory :topic/isolated-a)
      (tp.backend/unsubscribe! :topic.backend/memory :topic/isolated-b))))
