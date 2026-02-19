(ns metabase.mq.topic.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest publish-test
  (let [topic-name :topic/publish-test]
    (topic.backend/publish! :topic.backend/appdb topic-name ["test message"])
    (testing "Message is persisted in topic_message"
      (let [row (t2/select-one :topic_message_batch :topic_name (name topic-name))]
        (is (some? row))
        (is (= (name topic-name) (:topic_name row)))
        (is (= ["test message"] (json/decode (:messages row))))
        (is (some? (:created_at row)))))
    ;; cleanup
    (t2/delete! :topic_message_batch :topic_name (name topic-name))))

(deftest batch-publish-test
  (let [topic-name :topic/batch-publish-test]
    (topic.backend/publish! :topic.backend/appdb topic-name ["msg-1" "msg-2" "msg-3"])
    (testing "Batch of messages stored in single row"
      (let [row (t2/select-one :topic_message_batch :topic_name (name topic-name))]
        (is (= ["msg-1" "msg-2" "msg-3"] (json/decode (:messages row))))))
    ;; cleanup
    (t2/delete! :topic_message_batch :topic_name (name topic-name))))

(deftest subscribe-and-receive-test
  (let [topic-name :topic/sub-receive-test
        received   (atom [])]
    (topic.impl/subscribe! topic-name
                           (fn [{:keys [message]}]
                             (swap! received conj message)))
    (topic.backend/publish! :topic.backend/appdb topic-name ["hello-appdb"])
    ;; allow time for polling
    (Thread/sleep 5000)

    (testing "Subscriber receives the published message"
      (is (= ["hello-appdb"] @received)))

    (topic.impl/unsubscribe! topic-name)
    ;; cleanup
    (t2/delete! :topic_message_batch :topic_name (name topic-name))))

(deftest no-messages-without-subscribers-test
  (let [topic-name :topic/no-sub-test]
    (topic.backend/publish! :topic.backend/appdb topic-name ["orphan-msg"])
    (testing "Message exists in table even with no subscribers"
      (is (pos? (t2/count :topic_message_batch :topic_name (name topic-name)))))
    ;; cleanup
    (t2/delete! :topic_message_batch :topic_name (name topic-name))))
