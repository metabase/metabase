(ns metabase.queue.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.appdb :as q.appdb]
   [metabase.queue.backend :as q.backend]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest define-queue-test
  (is (nil? (q.backend/define-queue! :queue.backend/appdb :queue/test))))

(deftest create-and-remove-listener-test
  (let [queue-name (keyword "queue" (str (gensym "listener-test-")))]
    (testing "Create listener"
      (q.backend/listen! :queue.backend/appdb queue-name)
      (is (contains? @@#'q.appdb/listening-queues queue-name)))
    (testing "Close listener"
      (q.backend/close-queue! :queue.backend/appdb queue-name)
      (is (not (contains? @@#'q.appdb/listening-queues queue-name))))))

(deftest publish-test
  (let [queue-name (keyword "queue" (str (gensym "publish-test-")))]
    (q.backend/publish! :queue.backend/appdb queue-name "test message")
    (testing "Messages are persisted in the queue"
      (let [row (t2/select-one :model/QueueMessage :queue_name (name queue-name))]
        (is (= "test message" (:payload row)))
        (is (= (name queue-name) (:queue_name row)))
        (is (= "pending" (:status row)))
        (is (not (nil? (:status_heartbeat row))))
        (is (= (:created_at row) (:status_heartbeat row)))
        (is (= 0 (:failures row)))
        (is (nil? (:owner row)))))))

(deftest fetch-test
  (let [queue1 (keyword "queue" (str "queue1-" (gensym)))
        queue2 (keyword "queue" (str "queue2-" (gensym)))
        invalid-queue (keyword "queue" (str "queue-invalid-" (gensym)))]
    (with-redefs [q.appdb/listening-queues (atom #{queue1 queue2})]
      (t2/with-connection [_conn]
        (testing "Returns nil if no rows are found"
          (is (nil? (#'q.appdb/fetch!))))

        (t2/insert! :model/QueueMessage
                    {:queue_name (name invalid-queue)
                     :payload    "invalid"})
        (t2/insert! :model/QueueMessage
                    {:queue_name (name queue1)
                     :payload    "data1"})
        (t2/insert! :model/QueueMessage
                    {:queue_name (name queue2)
                     :payload    "data2"})

        (testing "Returns nil if no queues are defined"
          (with-redefs [q.appdb/listening-queues (atom #{})]
            (is (nil? (#'q.appdb/fetch!)))))
        (testing "Returns finds a row for a valid queue"
          (let [{:keys [id queue payload]} (#'q.appdb/fetch!)]
            (is (pos-int? id))
            (is (= queue1 queue))
            (is (= "data1" payload))
            (testing "Fetched row gets marked as processing"
              (let [updated-row (t2/select-one :model/QueueMessage :id id)]
                (is (= "processing" (:status updated-row)))
                (is (not= (:created_at updated-row) (:status_heartbeat updated-row)))
                (is (= 0 (:failures updated-row)))
                (is (= @#'q.appdb/owner-id (:owner updated-row)))))))
        (testing "Later calls don't re-pull processing rows"
          (let [{:keys [id queue payload]} (#'q.appdb/fetch!)]
            (is (pos-int? id))
            (is (= queue2 queue))
            (is (= "data2" payload))))
        (testing "When everything valid is pending, return nil"
          (is (nil? (#'q.appdb/fetch!))))))))

(deftest message-successful-test
  (let [queue-name (keyword "queue" (str (gensym "successful-test-")))]
    (testing "Message successful deletes the message"
      (let [message-id (t2/insert-returning-pk! :model/QueueMessage
                                                {:queue_name (name queue-name)
                                                 :payload "test-message"
                                                 :status "processing"})]
        (q.backend/message-successful! :queue.backend/appdb queue-name message-id)
        (is (nil? (t2/select-one :model/QueueMessage :id message-id)))))

    (testing "Message successful on non-existent message does not fail"
      (is (nil? (q.backend/message-successful! :queue.backend/appdb queue-name 99999))))))

(deftest message-failed-test
  (let [queue-name (keyword "queue" (str (gensym "failed-test-")))]
    (testing "Message failed resets to pending and increments failures"
      (let [message-id (t2/insert-returning-pk! :model/QueueMessage
                                                {:queue_name (name queue-name)
                                                 :payload "test-message"
                                                 :status "processing"
                                                 :failures 0
                                                 :owner @#'q.appdb/owner-id})]
        (q.backend/message-failed! :queue.backend/appdb queue-name message-id)
        (let [updated-message (t2/select-one :model/QueueMessage :id message-id)]
          (is (= "pending" (:status updated-message)))
          (is (= 1 (:failures updated-message)))
          (is (nil? (:owner updated-message)))
          (is (not (nil? (:status_heartbeat updated-message)))))))

    (testing "Message failed increments failures multiple times"
      (let [message-id (t2/insert-returning-pk! :model/QueueMessage
                                                {:queue_name (name queue-name)
                                                 :payload "test-message"
                                                 :status "processing"
                                                 :failures 2
                                                 :owner @#'q.appdb/owner-id})]
        (q.backend/message-failed! :queue.backend/appdb queue-name message-id)
        (let [updated-message (t2/select-one :model/QueueMessage :id message-id)]
          (is (= "pending" (:status updated-message)))
          (is (= 3 (:failures updated-message)))
          (is (nil? (:owner updated-message))))))

    (testing "Message failed on non-existent message does not fail"
      (is (nil? (q.backend/message-failed! :queue.backend/appdb queue-name 99999))))

    (testing "Message failed when being processed by another node is a no-op"
      (let [message-id (t2/insert-returning-pk! :model/QueueMessage
                                                {:queue_name (name queue-name)
                                                 :payload "test-message"
                                                 :status "processing"
                                                 :owner "another-node"
                                                 :failures 0})]
        (q.backend/message-failed! :queue.backend/appdb queue-name message-id)
        (let [updated-message (t2/select-one :model/QueueMessage :id message-id)]
          (is (= "processing" (:status updated-message)))
          (is (= 0 (:failures updated-message)))
          (is (= "another-node" (:owner updated-message))))))))
