(ns metabase.mq.topic.postgres-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.mq.topic.postgres :as topic.postgres]
   [metabase.mq.topic.test-util :as tpt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- postgres?
  "Returns true if the app DB is Postgres."
  []
  (= (mdb.connection/db-type) :postgres))

(deftest ^:parallel topic->channel-name-test
  (testing "Basic topic name conversion"
    (is (= "mb_ps_topic__foo" (topic.postgres/topic->channel-name :topic/foo))))
  (testing "Name is lowercased"
    (is (= "mb_ps_topic__myevent" (topic.postgres/topic->channel-name :topic/MyEvent))))
  (testing "Long names are hashed to fit within 63 bytes"
    (let [long-topic (keyword "topic" (apply str (repeat 100 "x")))
          channel    (topic.postgres/topic->channel-name long-topic)]
      (is (<= (count (.getBytes ^String channel "UTF-8")) 63))
      (is (.startsWith ^String channel "mb_ps_")))))

(deftest publish-and-receive-test
  (when (postgres?)
    (tpt/with-postgres-topics
      (let [received (atom [])
            topic    :topic/postgres-test]
        (topic.impl/subscribe! topic
                               (fn [{:keys [message]}]
                                 (swap! received conj message)))
        (topic.backend/publish! :topic.backend/postgres topic ["hello-pg"])
        (Thread/sleep 2000)
        (testing "Subscriber receives message via LISTEN/NOTIFY"
          (is (= ["hello-pg"] @received)))
        (topic.impl/unsubscribe! topic)))))

(deftest large-message-fallback-test
  (when (postgres?)
    (tpt/with-postgres-topics
      (let [received (atom [])
            topic    :topic/pg-large-msg-test
            ;; Create a message larger than 7500 bytes
            large-msg (apply str (repeat 8000 "x"))]
        (topic.impl/subscribe! topic
                               (fn [{:keys [message]}]
                                 (swap! received conj message)))
        (topic.backend/publish! :topic.backend/postgres topic [large-msg])
        (Thread/sleep 2000)
        (testing "Large message is delivered via table fallback"
          (is (= 1 (count @received)))
          (is (= large-msg (first @received))))
        (topic.impl/unsubscribe! topic)
        ;; cleanup fallback rows
        (t2/delete! :topic_message_batch :topic_name (name topic))))))

(deftest unsubscribe-test
  (when (postgres?)
    (tpt/with-postgres-topics
      (let [received (atom [])
            topic    :topic/pg-unsub-test]
        (topic.impl/subscribe! topic
                               (fn [{:keys [message]}]
                                 (swap! received conj message)))
        (topic.backend/publish! :topic.backend/postgres topic ["before-unsub"])
        (Thread/sleep 2000)
        (testing "Receives before unsubscribe"
          (is (= ["before-unsub"] @received)))
        (topic.impl/unsubscribe! topic)
        (topic.backend/publish! :topic.backend/postgres topic ["after-unsub"])
        (Thread/sleep 2000)
        (testing "Does not receive after unsubscribe"
          (is (= ["before-unsub"] @received)))))))
