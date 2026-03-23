(ns metabase.mq.queue.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)))

(set! *warn-on-reflection* true)

(deftest publish-test
  (let [queue-name (keyword "queue" (str (gensym "publish-test-")))]
    (try
      (q.backend/publish! :queue.backend/appdb queue-name ["test message"])
      (testing "Messages are persisted in the queue"
        (let [row (t2/select-one :queue_message_batch :queue_name (name queue-name))]
          (is (= ["test message"] (json/decode (:messages row))))
          (is (= (name queue-name) (:queue_name row)))
          (is (= "pending" (:status row)))
          (is (not (nil? (:status_heartbeat row))))
          (is (= (:created_at row) (:status_heartbeat row)))
          (is (= 0 (:failures row)))
          (is (nil? (:owner row)))))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))

(deftest fetch-test
  (let [queue1 (keyword "queue" (str "queue1-" (gensym)))
        queue2 (keyword "queue" (str "queue2-" (gensym)))
        invalid-queue (keyword "queue" (str "queue-invalid-" (gensym)))]
    (binding [listener/*listeners* (atom {queue1 {:listener identity} queue2 {:listener identity}})]
      (try
        (t2/with-connection [_conn]
          (testing "Returns nil if no rows are found"
            (is (nil? (#'q.appdb/fetch! (listener/queue-names)))))

          (t2/insert! :queue_message_batch
                      {:queue_name (name invalid-queue)
                       :messages   (json/encode ["invalid"])})
          (t2/insert! :queue_message_batch
                      {:queue_name (name queue1)
                       :messages   (json/encode ["data1"])})
          (t2/insert! :queue_message_batch
                      {:queue_name (name queue2)
                       :messages   (json/encode ["data2"])})

          (testing "Returns nil if no queues are defined"
            (binding [listener/*listeners* (atom {})]
              (is (nil? (#'q.appdb/fetch! (listener/queue-names))))))
          (testing "Returns finds a row for a valid queue"
            (let [{:keys [bundle-id queue messages]} (#'q.appdb/fetch! (listener/queue-names))]
              (is (pos-int? bundle-id))
              (is (= queue1 queue))
              (is (= ["data1"] messages))
              (testing "Fetched row gets marked as processing"
                (let [updated-row (t2/select-one :queue_message_batch :id bundle-id)]
                  (is (= "processing" (:status updated-row)))
                  (is (not= (:created_at updated-row) (:status_heartbeat updated-row)))
                  (is (= 0 (:failures updated-row)))
                  (is (= @#'q.appdb/owner-id (:owner updated-row)))))))
          (testing "Later calls don't re-pull processing rows"
            (let [{:keys [bundle-id queue messages]} (#'q.appdb/fetch! (listener/queue-names))]
              (is (pos-int? bundle-id))
              (is (= queue2 queue))
              (is (= ["data2"] messages))))
          (testing "When everything valid is pending, return nil"
            (is (nil? (#'q.appdb/fetch! (listener/queue-names))))))
        (finally
          (t2/delete! :queue_message_batch :queue_name [:in [(name queue1) (name queue2) (name invalid-queue)]]))))))

(deftest exclusive-fetch-test
  (let [exclusive-q (keyword "queue" (str "exclusive-" (random-uuid)))
        normal-q    (keyword "queue" (str "normal-" (random-uuid)))]
    (binding [listener/*listeners* (atom {exclusive-q {:listener identity :exclusive true}
                                          normal-q    {:listener identity :exclusive false}})]
      (try
        (t2/with-connection [_conn]
          (testing "With no processing rows, exclusive queue messages are fetched normally"
            (t2/insert! :queue_message_batch
                        {:queue_name (name exclusive-q)
                         :messages   (json/encode ["exclusive-msg1"])})
            (let [{:keys [queue messages]} (#'q.appdb/fetch! (listener/queue-names))]
              (is (= exclusive-q queue))
              (is (= ["exclusive-msg1"] messages))))

          (testing "With a processing row on exclusive queue, fetch skips it"
            (t2/insert! :queue_message_batch
                        {:queue_name (name exclusive-q)
                         :messages   (json/encode ["exclusive-msg2"])})
            ;; The first message is now 'processing', so the second should be skipped
            (is (nil? (#'q.appdb/fetch! (listener/queue-names)))
                "Should return nil because exclusive queue has a processing row"))

          (testing "Non-exclusive queue is still fetchable even when exclusive queue is blocked"
            (t2/insert! :queue_message_batch
                        {:queue_name (name normal-q)
                         :messages   (json/encode ["normal-msg1"])})
            (let [{:keys [queue messages]} (#'q.appdb/fetch! (listener/queue-names))]
              (is (= normal-q queue))
              (is (= ["normal-msg1"] messages))))

          (testing "After exclusive processing completes, next message can be fetched"
            ;; Mark the processing row as done by deleting it (simulating bundle-successful!)
            (t2/delete! :queue_message_batch :queue_name (name exclusive-q) :status "processing")
            (let [{:keys [queue messages]} (#'q.appdb/fetch! (listener/queue-names))]
              (is (= exclusive-q queue))
              (is (= ["exclusive-msg2"] messages)))))
        (finally
          (t2/delete! :queue_message_batch :queue_name [:in [(name exclusive-q) (name normal-q)]]))))))

(deftest message-successful-test
  (let [queue-name (keyword "queue" (str (gensym "successful-test-")))]
    (testing "Message successful deletes the message"
      (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                {:queue_name (name queue-name)
                                                 :messages (json/encode ["test-message"])
                                                 :status "processing"
                                                 :owner @#'q.appdb/owner-id})]
        (q.backend/bundle-successful! :queue.backend/appdb queue-name message-id)
        (is (nil? (t2/select-one :queue_message_batch :id message-id)))))

    (testing "Message successful on non-existent message does not fail"
      (is (nil? (q.backend/bundle-successful! :queue.backend/appdb queue-name 99999))))))

;; Note: no cleanup needed — bundle-successful! deletes the row

(deftest message-failed-test
  (let [queue-name (keyword "queue" (str (gensym "failed-test-")))]
    (try
      (testing "Message failed resets to pending and increments failures"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name (name queue-name)
                                                   :messages (json/encode ["test-message"])
                                                   :status "processing"
                                                   :failures 0
                                                   :owner @#'q.appdb/owner-id})]
          (q.backend/bundle-failed! :queue.backend/appdb queue-name message-id)
          (let [updated-message (t2/select-one :queue_message_batch :id message-id)]
            (is (= "pending" (:status updated-message)))
            (is (= 1 (:failures updated-message)))
            (is (nil? (:owner updated-message)))
            (is (not (nil? (:status_heartbeat updated-message)))))))

      (testing "Message failed increments failures multiple times"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name (name queue-name)
                                                   :messages (json/encode ["test-message"])
                                                   :status "processing"
                                                   :failures 2
                                                   :owner @#'q.appdb/owner-id})]
          (q.backend/bundle-failed! :queue.backend/appdb queue-name message-id)
          (let [updated-message (t2/select-one :queue_message_batch :id message-id)]
            (is (= "pending" (:status updated-message)))
            (is (= 3 (:failures updated-message)))
            (is (nil? (:owner updated-message))))))

      (testing "Message moved to failed status after max failures"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name (name queue-name)
                                                   :messages (json/encode ["test-message"])
                                                   :status "processing"
                                                   :failures (dec (mq.settings/queue-max-retries))
                                                   :owner @#'q.appdb/owner-id})]
          (q.backend/bundle-failed! :queue.backend/appdb queue-name message-id)
          (let [updated-message (t2/select-one :queue_message_batch :id message-id)]
            (is (= "failed" (:status updated-message)))
            (is (= (mq.settings/queue-max-retries) (:failures updated-message)))
            (is (nil? (:owner updated-message))))))

      (testing "Message failed on non-existent message does not fail"
        (is (nil? (q.backend/bundle-failed! :queue.backend/appdb queue-name 99999))))

      (testing "Message failed when being processed by another node is a no-op"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name (name queue-name)
                                                   :messages (json/encode ["test-message"])
                                                   :status "processing"
                                                   :owner "another-node"
                                                   :failures 0})]
          (q.backend/bundle-failed! :queue.backend/appdb queue-name message-id)
          (let [updated-message (t2/select-one :queue_message_batch :id message-id)]
            (is (= "processing" (:status updated-message)))
            (is (= 0 (:failures updated-message)))
            (is (= "another-node" (:owner updated-message))))))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))

(deftest recover-stale-processing-batches-test
  (let [queue-name (keyword "queue" (str "stale-test-" (random-uuid)))
        stale-heartbeat (Timestamp/from (.minusMillis (Instant/now) (+ @#'q.appdb/stale-processing-timeout-ms 60000)))]
    (try
      (testing "Stale processing batch is reset to pending with incremented failures"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name       (name queue-name)
                                                   :messages         (json/encode ["stale-msg"])
                                                   :status           "processing"
                                                   :status_heartbeat stale-heartbeat
                                                   :failures         1
                                                   :owner            "dead-owner"})]
          (is (pos? (q.appdb/recover-stale-processing-batches!)))
          (let [row (t2/select-one :queue_message_batch :id message-id)]
            (is (= "pending" (:status row)))
            (is (= 2 (:failures row)))
            (is (nil? (:owner row))))))

      (testing "Stale batch at max retries is marked as failed"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name       (name queue-name)
                                                   :messages         (json/encode ["stale-msg-max"])
                                                   :status           "processing"
                                                   :status_heartbeat stale-heartbeat
                                                   :failures         (dec (mq.settings/queue-max-retries))
                                                   :owner            "dead-owner"})]
          (is (pos? (q.appdb/recover-stale-processing-batches!)))
          (let [row (t2/select-one :queue_message_batch :id message-id)]
            (is (= "failed" (:status row)))
            (is (= (mq.settings/queue-max-retries) (:failures row)))
            (is (nil? (:owner row))))))

      (testing "Recent processing batch is not recovered by stale check"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name       (name queue-name)
                                                   :messages         (json/encode ["recent-msg"])
                                                   :status           "processing"
                                                   :failures         0
                                                   :owner            "active-owner"})]
          (q.appdb/recover-stale-processing-batches!)
          (let [row (t2/select-one :queue_message_batch :id message-id)]
            (is (= "processing" (:status row)))
            (is (= 0 (:failures row))))))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))

(deftest recover-all-processing-batches-test
  (let [queue-name (keyword "queue" (str "recover-all-test-" (random-uuid)))]
    (try
      (testing "Recovers recent processing batches that stale check would skip"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name       (name queue-name)
                                                   :messages         (json/encode ["recent-msg"])
                                                   :status           "processing"
                                                   :failures         0
                                                   :owner            "some-owner"})]
          (is (pos? (q.appdb/recover-all-processing-batches!)))
          (let [row (t2/select-one :queue_message_batch :id message-id)]
            (is (= "pending" (:status row)))
            (is (= 1 (:failures row)))
            (is (nil? (:owner row))))))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))
