(ns metabase.mq.topic.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.memory :as topic.memory])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-memory-topics
  [& body]
  `(binding [topic.backend/*backend*           :topic.backend/memory
             topic.backend/*handlers*          (atom {})
             topic.memory/*topics*             (atom {})
             topic.memory/*offsets*            (atom {})
             topic.memory/*background-process* (atom nil)]
     ~@body))

(deftest ^:parallel publish-and-subscribe-test
  (with-memory-topics
    (let [received (atom [])]
      (mq/subscribe! :topic/test
                     (fn [{:keys [message]}]
                       (swap! received conj message)))
      (mq/publish! :topic/test ["hello"])
      (mq/publish! :topic/test ["world"])
      (Thread/sleep 200)

      (testing "Subscriber receives published messages"
        (is (= ["hello" "world"] @received)))

      (mq/unsubscribe! :topic/test))))

(deftest ^:parallel batch-publish-test
  (with-memory-topics
    (let [received (atom [])]
      (mq/subscribe! :topic/batch
                     (fn [{:keys [message]}]
                       (swap! received conj message)))
      (mq/publish! :topic/batch ["msg-1" "msg-2" "msg-3"])
      (Thread/sleep 200)

      (testing "Batch of messages received in one row"
        (is (= ["msg-1" "msg-2" "msg-3"] @received)))

      (mq/unsubscribe! :topic/batch))))

(deftest ^:parallel subscribe-only-sees-new-messages-test
  (with-memory-topics
    (mq/publish! :topic/late-join ["before-subscribe"])
    (let [received (atom [])]
      (mq/subscribe! :topic/late-join
                     (fn [{:keys [message]}]
                       (swap! received conj message)))

      (mq/publish! :topic/late-join ["after-subscribe"])
      (Thread/sleep 200)

      (testing "Subscriber only sees messages published after subscribing"
        (is (= ["after-subscribe"] @received)))

      (mq/unsubscribe! :topic/late-join))))

(deftest ^:parallel unsubscribe-stops-delivery-test
  (with-memory-topics
    (let [received (atom [])]
      (mq/subscribe! :topic/unsub
                     (fn [{:keys [message]}]
                       (swap! received conj message)))

      (mq/publish! :topic/unsub ["before"])
      (Thread/sleep 200)
      (is (= ["before"] @received))

      (mq/unsubscribe! :topic/unsub)

      (mq/publish! :topic/unsub ["after"])
      (Thread/sleep 200)

      (testing "No messages received after unsubscribe"
        (is (= ["before"] @received))))))

(deftest ^:parallel error-handling-test
  (with-memory-topics
    (let [received (atom [])]
      (mq/subscribe! :topic/errors
                     (fn [{:keys [message]}]
                       (when (= "error!" message)
                         (throw (ex-info "Test error" {})))
                       (swap! received conj message)))

      (mq/publish! :topic/errors ["good"])
      (mq/publish! :topic/errors ["error!"])
      (mq/publish! :topic/errors ["also-good"])
      (Thread/sleep 200)

      (testing "Good messages are received"
        (is (= ["good" "also-good"] @received)))

      (mq/unsubscribe! :topic/errors))))

(deftest ^:parallel double-subscribe-throws-test
  (with-memory-topics
    (mq/subscribe! :topic/double (fn [_] nil))
    (testing "Subscribing twice to the same topic throws"
      (is (thrown-with-msg? ExceptionInfo #"Handler already registered"
                            (mq/subscribe! :topic/double (fn [_] nil)))))
    (mq/unsubscribe! :topic/double)))

(deftest ^:parallel topic-isolation-test
  (with-memory-topics
    (let [received-a (atom [])
          received-b (atom [])]
      (mq/subscribe! :topic/isolated-a
                     (fn [{:keys [message]}]
                       (swap! received-a conj message)))
      (mq/subscribe! :topic/isolated-b
                     (fn [{:keys [message]}]
                       (swap! received-b conj message)))

      (mq/publish! :topic/isolated-a ["for-a"])
      (mq/publish! :topic/isolated-b ["for-b"])
      (Thread/sleep 200)

      (testing "Messages on topic A don't appear on topic B"
        (is (= ["for-a"] @received-a))
        (is (= ["for-b"] @received-b)))

      (mq/unsubscribe! :topic/isolated-a)
      (mq/unsubscribe! :topic/isolated-b))))
