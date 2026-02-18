(ns metabase.mq.topic.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.topic.backend :as tp.backend]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest publish-test
  (let [topic-name :topic/publish-test]
    (tp.backend/publish! :topic.backend/appdb topic-name ["test message"])
    (testing "Message is persisted in topic_message"
      (let [row (t2/select-one :topic_message :topic_name (name topic-name))]
        (is (some? row))
        (is (= (name topic-name) (:topic_name row)))
        (is (= ["test message"] (json/decode (:messages row))))
        (is (some? (:created_at row)))))
    ;; cleanup
    (t2/delete! :topic_message :topic_name (name topic-name))))

(deftest batch-publish-test
  (let [topic-name :topic/batch-publish-test]
    (tp.backend/publish! :topic.backend/appdb topic-name ["msg-1" "msg-2" "msg-3"])
    (testing "Batch of messages stored in single row"
      (let [row (t2/select-one :topic_message :topic_name (name topic-name))]
        (is (= ["msg-1" "msg-2" "msg-3"] (json/decode (:messages row))))))
    ;; cleanup
    (t2/delete! :topic_message :topic_name (name topic-name))))

(deftest subscribe-and-receive-test
  (let [topic-name :topic/sub-receive-test
        received   (atom [])]
    (tp.backend/subscribe! :topic.backend/appdb topic-name "test-subscriber"
                           (fn [{:keys [messages]}]
                             (swap! received into messages)))
    (tp.backend/publish! :topic.backend/appdb topic-name ["hello-appdb"])
    ;; allow time for polling
    (Thread/sleep 5000)

    (testing "Subscriber receives the published message"
      (is (= ["hello-appdb"] @received)))

    (tp.backend/unsubscribe! :topic.backend/appdb topic-name "test-subscriber")
    ;; cleanup
    (t2/delete! :topic_message :topic_name (name topic-name))))

(deftest fan-out-appdb-test
  (let [topic-name :topic/fan-out-appdb
        received-1 (atom [])
        received-2 (atom [])]
    (tp.backend/subscribe! :topic.backend/appdb topic-name "sub-1"
                           (fn [{:keys [messages]}]
                             (swap! received-1 into messages)))
    (tp.backend/subscribe! :topic.backend/appdb topic-name "sub-2"
                           (fn [{:keys [messages]}]
                             (swap! received-2 into messages)))

    (tp.backend/publish! :topic.backend/appdb topic-name ["broadcast"])
    (Thread/sleep 5000)

    (testing "Both subscribers receive the message"
      (is (= ["broadcast"] @received-1))
      (is (= ["broadcast"] @received-2)))

    (tp.backend/unsubscribe! :topic.backend/appdb topic-name "sub-1")
    (tp.backend/unsubscribe! :topic.backend/appdb topic-name "sub-2")
    (t2/delete! :topic_message :topic_name (name topic-name))))

(deftest cleanup-test
  (let [topic-name :topic/cleanup-test]
    (tp.backend/publish! :topic.backend/appdb topic-name ["old-message"])
    (testing "Message exists before cleanup"
      (is (pos? (t2/count :topic_message :topic_name (name topic-name)))))

    ;; cleanup with 0ms max age should delete all messages
    (tp.backend/cleanup! :topic.backend/appdb topic-name 0)

    (testing "Messages removed after cleanup"
      (is (zero? (t2/count :topic_message :topic_name (name topic-name)))))))

(deftest no-messages-without-subscribers-test
  (let [topic-name :topic/no-sub-test]
    (tp.backend/publish! :topic.backend/appdb topic-name ["orphan-msg"])
    (testing "Message exists in table even with no subscribers"
      (is (pos? (t2/count :topic_message :topic_name (name topic-name)))))
    ;; cleanup
    (t2/delete! :topic_message :topic_name (name topic-name))))
