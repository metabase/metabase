(ns metabase.mq.topic.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.analytics :as mq.analytics]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.topic.appdb :as topic.appdb]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)))

(set! *warn-on-reflection* true)

(deftest publish-test
  (let [topic-name :topic/publish-test]
    (topic.backend/publish! topic.appdb/backend topic-name ["test message"])
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
    (topic.backend/publish! topic.appdb/backend topic-name ["msg-1" "msg-2" "msg-3"])
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
      (binding [topic.backend/*backend* topic.appdb/backend]
        (listener/listen! topic-name
                          {}
                          (fn [message]
                            (swap! received conj message))))
      ;; Publish then deliver synchronously via poll-iteration! + deliver!
      (topic.backend/publish! topic.appdb/backend topic-name ["hello-appdb"])
      ;; poll-iteration! fetches rows and calls submit-delivery! which is async.
      ;; Instead, poll the messages and deliver synchronously on this thread.
      (let [offset (or (get @@#'topic.appdb/offsets topic-name) 0)
            rows   (#'topic.appdb/poll-messages! topic-name offset)]
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
    (topic.backend/publish! topic.appdb/backend topic-name ["orphan-msg"])
    (testing "Message exists in table even with no subscribers"
      (is (pos? (t2/count :topic_message_batch :topic_name (name topic-name)))))
    ;; cleanup
    (t2/delete! :topic_message_batch :topic_name (name topic-name))))

(deftest cleanup-old-messages-test
  (let [topic-name (str "cleanup-test-" (random-uuid))
        old-ts     (Timestamp/from (.minusMillis (Instant/now) (+ (* 60 60 1000) 60000)))]
    (try
      (testing "Topic messages older than 1 hour are deleted"
        (t2/query {:insert-into :topic_message_batch
                   :values      [{:topic_name topic-name
                                  :messages   (json/encode ["old-msg"])
                                  :created_at old-ts}]})
        (let [old-row (t2/select-one :topic_message_batch :topic_name topic-name)]
          (#'topic.appdb/cleanup-old-messages!)
          (is (nil? (t2/select-one :topic_message_batch :id (:id old-row)))
              "Old topic message should be deleted")))

      (testing "Recent topic messages are not deleted"
        (t2/insert! :topic_message_batch {:topic_name topic-name :messages (json/encode ["recent-msg"])})
        (let [recent-row (t2/select-one :topic_message_batch :topic_name topic-name)]
          (#'topic.appdb/cleanup-old-messages!)
          (is (some? (t2/select-one :topic_message_batch :id (:id recent-row)))
              "Recent topic message should not be deleted")))
      (finally
        (t2/delete! :topic_message_batch :topic_name topic-name)))))

(deftest lag-gauge-test
  (let [topic-name  (keyword "topic" (str "lag-gauge-test-" (random-uuid)))
        gauge-calls (atom [])]
    (try
      ;; Publish two messages and look up their IDs from the DB
      (topic.backend/publish! topic.appdb/backend topic-name ["m1"])
      (let [id1 (:id (first (t2/query {:select   [:id]
                                       :from     [:topic_message_batch]
                                       :where    [:= :topic_name (name topic-name)]
                                       :order-by [[:id :desc]]
                                       :limit    1})))]
        ;; Subscriber has read up to id1
        (swap! @#'topic.appdb/offsets assoc topic-name id1)
        ;; Publish a second message (unread)
        (topic.backend/publish! topic.appdb/backend topic-name ["m2"])
        (let [id2 (:id (first (t2/query {:select   [:id]
                                         :from     [:topic_message_batch]
                                         :where    [:= :topic_name (name topic-name)]
                                         :order-by [[:id :desc]]
                                         :limit    1})))]
          (with-redefs [mq.analytics/set! (fn [metric labels value]
                                            (when (= metric :metabase-mq/appdb-topic-subscriber-lag)
                                              (swap! gauge-calls conj {:labels labels :value value})))]
            (#'topic.appdb/update-lag-gauges!))
          (testing "Lag gauge is emitted with the correct unread count"
            (let [call (first (filter #(= (name topic-name) (-> % :labels :channel)) @gauge-calls))]
              (is (some? call) "Gauge should be recorded for the test topic")
              (is (= (- id2 id1) (:value call))
                  "Lag should equal the difference between max-id and current offset")))))
      (finally
        (swap! @#'topic.appdb/offsets dissoc topic-name)
        (t2/delete! :topic_message_batch :topic_name (name topic-name))))))
