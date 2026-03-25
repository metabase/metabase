(ns metabase.mq.topic.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.topic.appdb]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.transport-impl]
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
  (let [topic-name (keyword "topic" (str "sub-receive-test-" (random-uuid)))
        received   (atom [])]
    (try
      ;; Register listener (this also subscribes, setting the offset via the current *backend*)
      (binding [topic.backend/*backend* :topic.backend/appdb]
        (listener/listen! topic-name
                          {}
                          (fn [message]
                            (swap! received conj message))))
      ;; Publish then deliver synchronously via poll-iteration! + deliver!
      (topic.backend/publish! :topic.backend/appdb topic-name ["hello-appdb"])
      ;; poll-iteration! fetches rows and calls submit-delivery! which is async.
      ;; Instead, poll the messages and deliver synchronously on this thread.
      (let [offset (or (get @@#'metabase.mq.topic.appdb/offsets topic-name) 0)
            rows   (#'metabase.mq.topic.appdb/poll-messages! topic-name offset)]
        (when (seq rows)
          (let [all-messages (into [] (mapcat (comp json/decode :messages)) rows)]
            (mq.impl/deliver! topic-name all-messages nil nil))))

      (testing "Subscriber receives the published message"
        (is (= ["hello-appdb"] @received)))
      (finally
        (listener/unlisten! topic-name)
        (t2/delete! :topic_message_batch :topic_name (name topic-name))))))

(deftest no-messages-without-subscribers-test
  (let [topic-name :topic/no-sub-test]
    (topic.backend/publish! :topic.backend/appdb topic-name ["orphan-msg"])
    (testing "Message exists in table even with no subscribers"
      (is (pos? (t2/count :topic_message_batch :topic_name (name topic-name)))))
    ;; cleanup
    (t2/delete! :topic_message_batch :topic_name (name topic-name))))
