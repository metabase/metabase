(ns metabase.mq.pubsub.postgres-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.mq.pubsub.backend :as ps.backend]
   [metabase.mq.pubsub.postgres :as ps.postgres]
   [metabase.mq.pubsub.test-util :as pst]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- postgres?
  "Returns true if the app DB is Postgres."
  []
  (= (mdb.connection/db-type) :postgres))

(deftest ^:parallel topic->channel-name-test
  (testing "Basic topic name conversion"
    (is (= "mb_ps_topic__foo" (ps.postgres/topic->channel-name :topic/foo))))
  (testing "Name is lowercased"
    (is (= "mb_ps_topic__myevent" (ps.postgres/topic->channel-name :topic/MyEvent))))
  (testing "Long names are hashed to fit within 63 bytes"
    (let [long-topic (keyword "topic" (apply str (repeat 100 "x")))
          channel    (ps.postgres/topic->channel-name long-topic)]
      (is (<= (count (.getBytes ^String channel "UTF-8")) 63))
      (is (.startsWith ^String channel "mb_ps_")))))

(deftest publish-and-receive-test
  (when (postgres?)
    (pst/with-postgres-pubsub
      (let [received (atom [])
            topic    :topic/postgres-test]
        (ps.backend/subscribe! :mq.pubsub.backend/postgres topic "test-sub"
                               (fn [{:keys [messages]}]
                                 (swap! received into messages)))
        (ps.backend/publish! :mq.pubsub.backend/postgres topic ["hello-pg"])
        (Thread/sleep 2000)
        (testing "Subscriber receives message via LISTEN/NOTIFY"
          (is (= ["hello-pg"] @received)))
        (ps.backend/unsubscribe! :mq.pubsub.backend/postgres topic "test-sub")))))

(deftest large-message-fallback-test
  (when (postgres?)
    (pst/with-postgres-pubsub
      (let [received (atom [])
            topic    :topic/pg-large-msg-test
            ;; Create a message larger than 7500 bytes
            large-msg (apply str (repeat 8000 "x"))]
        (ps.backend/subscribe! :mq.pubsub.backend/postgres topic "large-sub"
                               (fn [{:keys [messages]}]
                                 (swap! received into messages)))
        (ps.backend/publish! :mq.pubsub.backend/postgres topic [large-msg])
        (Thread/sleep 2000)
        (testing "Large message is delivered via table fallback"
          (is (= 1 (count @received)))
          (is (= large-msg (first @received))))
        (ps.backend/unsubscribe! :mq.pubsub.backend/postgres topic "large-sub")
        ;; cleanup fallback rows
        (t2/delete! :topic_message :topic_name (name topic))))))

(deftest fan-out-test
  (when (postgres?)
    (pst/with-postgres-pubsub
      (let [received-a (atom [])
            received-b (atom [])
            topic      :topic/pg-fan-out-test]
        (ps.backend/subscribe! :mq.pubsub.backend/postgres topic "fan-a"
                               (fn [{:keys [messages]}]
                                 (swap! received-a into messages)))
        (ps.backend/subscribe! :mq.pubsub.backend/postgres topic "fan-b"
                               (fn [{:keys [messages]}]
                                 (swap! received-b into messages)))
        (ps.backend/publish! :mq.pubsub.backend/postgres topic ["broadcast"])
        (Thread/sleep 2000)
        (testing "Both subscribers receive the broadcast"
          (is (= ["broadcast"] @received-a))
          (is (= ["broadcast"] @received-b)))
        (ps.backend/unsubscribe! :mq.pubsub.backend/postgres topic "fan-a")
        (ps.backend/unsubscribe! :mq.pubsub.backend/postgres topic "fan-b")))))

(deftest unsubscribe-test
  (when (postgres?)
    (pst/with-postgres-pubsub
      (let [received (atom [])
            topic    :topic/pg-unsub-test]
        (ps.backend/subscribe! :mq.pubsub.backend/postgres topic "unsub-handler"
                               (fn [{:keys [messages]}]
                                 (swap! received into messages)))
        (ps.backend/publish! :mq.pubsub.backend/postgres topic ["before-unsub"])
        (Thread/sleep 2000)
        (testing "Receives before unsubscribe"
          (is (= ["before-unsub"] @received)))
        (ps.backend/unsubscribe! :mq.pubsub.backend/postgres topic "unsub-handler")
        (ps.backend/publish! :mq.pubsub.backend/postgres topic ["after-unsub"])
        (Thread/sleep 2000)
        (testing "Does not receive after unsubscribe"
          (is (= ["before-unsub"] @received)))))))
