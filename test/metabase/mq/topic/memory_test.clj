(ns metabase.mq.topic.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.topic.backend :as tp.backend]
   [metabase.mq.topic.test-util :as tpt])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel publish-and-subscribe-test
  (tpt/with-memory-topics [recent]
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/tracking :topic/test "sub-1"
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

      (tp.backend/unsubscribe! :topic.backend/tracking :topic/test "sub-1"))))

(deftest ^:parallel batch-publish-test
  (tpt/with-memory-topics [_recent]
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/memory :topic/batch "sub-1"
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))
      (tp.backend/publish! :topic.backend/memory :topic/batch ["msg-1" "msg-2" "msg-3"])
      (Thread/sleep 200)

      (testing "Batch of messages received in one row"
        (is (= ["msg-1" "msg-2" "msg-3"] @received)))

      (tp.backend/unsubscribe! :topic.backend/memory :topic/batch "sub-1"))))

(deftest ^:parallel fan-out-test
  (tpt/with-memory-topics [recent]
    (let [received-1 (atom [])
          received-2 (atom [])]
      (tp.backend/subscribe! :topic.backend/tracking :topic/fan-out "sub-1"
                             (fn [{:keys [messages]}]
                               (swap! received-1 into messages)))
      (tp.backend/subscribe! :topic.backend/tracking :topic/fan-out "sub-2"
                             (fn [{:keys [messages]}]
                               (swap! received-2 into messages)))

      (tp.backend/publish! :topic.backend/tracking :topic/fan-out ["broadcast"])
      (Thread/sleep 200)

      (testing "Both subscribers receive the message"
        (is (= ["broadcast"] @received-1))
        (is (= ["broadcast"] @received-2)))

      (testing "Received messages tracked for each subscriber"
        (is (= 2 (count @(:received-messages recent)))))

      (tp.backend/unsubscribe! :topic.backend/tracking :topic/fan-out "sub-1")
      (tp.backend/unsubscribe! :topic.backend/tracking :topic/fan-out "sub-2"))))

(deftest ^:parallel subscribe-only-sees-new-messages-test
  (tpt/with-memory-topics [_recent]
    (tp.backend/publish! :topic.backend/memory :topic/late-join ["before-subscribe"])
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/memory :topic/late-join "late-sub"
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))

      (tp.backend/publish! :topic.backend/memory :topic/late-join ["after-subscribe"])
      (Thread/sleep 200)

      (testing "Subscriber only sees messages published after subscribing"
        (is (= ["after-subscribe"] @received)))

      (tp.backend/unsubscribe! :topic.backend/memory :topic/late-join "late-sub"))))

(deftest ^:parallel unsubscribe-stops-delivery-test
  (tpt/with-memory-topics [_recent]
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/memory :topic/unsub "sub-1"
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))

      (tp.backend/publish! :topic.backend/memory :topic/unsub ["before"])
      (Thread/sleep 200)
      (is (= ["before"] @received))

      (tp.backend/unsubscribe! :topic.backend/memory :topic/unsub "sub-1")

      (tp.backend/publish! :topic.backend/memory :topic/unsub ["after"])
      (Thread/sleep 200)

      (testing "No messages received after unsubscribe"
        (is (= ["before"] @received))))))

(deftest ^:parallel error-handling-test
  (tpt/with-memory-topics [recent]
    (let [received (atom [])]
      (tp.backend/subscribe! :topic.backend/tracking :topic/errors "error-sub"
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

      (tp.backend/unsubscribe! :topic.backend/tracking :topic/errors "error-sub"))))

(deftest ^:parallel double-subscribe-throws-test
  (tpt/with-memory-topics [_recent]
    (tp.backend/subscribe! :topic.backend/memory :topic/double "sub-1"
                           (fn [_] nil))
    (testing "Subscribing the same name to the same topic throws"
      (is (thrown-with-msg? ExceptionInfo #"Handler already registered"
                            (tp.backend/subscribe! :topic.backend/memory :topic/double "sub-1"
                                                   (fn [_] nil)))))
    (tp.backend/unsubscribe! :topic.backend/memory :topic/double "sub-1")))

(deftest ^:parallel cleanup-removes-old-messages-test
  (tpt/with-memory-topics [_recent]
    (tp.backend/publish! :topic.backend/memory :topic/cleanup ["old-msg"])
    ;; Wait so the message ages past the threshold
    (Thread/sleep 50)

    (testing "Cleanup removes messages older than max-age-ms"
      (let [removed (tp.backend/cleanup! :topic.backend/memory :topic/cleanup 10)]
        (is (= 1 removed))))

    (testing "No messages remain after cleanup"
      (is (= 0 (tp.backend/cleanup! :topic.backend/memory :topic/cleanup 10))))))

(deftest ^:parallel topic-isolation-test
  (tpt/with-memory-topics [_recent]
    (let [received-a (atom [])
          received-b (atom [])]
      (tp.backend/subscribe! :topic.backend/memory :topic/isolated-a "sub-a"
                             (fn [{:keys [messages]}]
                               (swap! received-a into messages)))
      (tp.backend/subscribe! :topic.backend/memory :topic/isolated-b "sub-b"
                             (fn [{:keys [messages]}]
                               (swap! received-b into messages)))

      (tp.backend/publish! :topic.backend/memory :topic/isolated-a ["for-a"])
      (tp.backend/publish! :topic.backend/memory :topic/isolated-b ["for-b"])
      (Thread/sleep 200)

      (testing "Messages on topic A don't appear on topic B"
        (is (= ["for-a"] @received-a))
        (is (= ["for-b"] @received-b)))

      (tp.backend/unsubscribe! :topic.backend/memory :topic/isolated-a "sub-a")
      (tp.backend/unsubscribe! :topic.backend/memory :topic/isolated-b "sub-b"))))
