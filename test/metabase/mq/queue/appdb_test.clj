(ns metabase.mq.queue.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.analytics :as mq.analytics]
   [metabase.mq.impl :as mq.impl]
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
          (testing "Fetches one row per queue in a single call"
            (let [results (#'q.appdb/fetch! (listener/queue-names))
                  by-queue (into {} (map (juxt :queue identity)) results)]
              (is (= 2 (count results)))
              (testing "queue1 row"
                (let [{:keys [batch-id messages]} (get by-queue queue1)]
                  (is (pos-int? batch-id))
                  (is (= ["data1"] messages))
                  (testing "Fetched row gets marked as processing"
                    (let [updated-row (t2/select-one :queue_message_batch :id batch-id)]
                      (is (= "processing" (:status updated-row)))
                      (is (not= (:created_at updated-row) (:status_heartbeat updated-row)))
                      (is (= 0 (:failures updated-row)))
                      (is (= @#'q.appdb/owner-id (:owner updated-row)))))))
              (testing "queue2 row"
                (let [{:keys [batch-id messages]} (get by-queue queue2)]
                  (is (pos-int? batch-id))
                  (is (= ["data2"] messages))))))
          (testing "When everything valid is processing, return nil"
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
            (let [results (#'q.appdb/fetch! (listener/queue-names))
                  {:keys [queue messages]} (first results)]
              (is (= 1 (count results)))
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
            (let [results (#'q.appdb/fetch! (listener/queue-names))
                  {:keys [queue messages]} (first results)]
              (is (= 1 (count results)))
              (is (= normal-q queue))
              (is (= ["normal-msg1"] messages))))

          (testing "After exclusive processing completes, next message can be fetched"
            ;; Mark the processing row as done by deleting it (simulating batch-successful!)
            (t2/delete! :queue_message_batch :queue_name (name exclusive-q) :status "processing")
            (let [results (#'q.appdb/fetch! (listener/queue-names))
                  {:keys [queue messages]} (first results)]
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
        (q.backend/batch-successful! :queue.backend/appdb queue-name message-id)
        (is (nil? (t2/select-one :queue_message_batch :id message-id)))))

    (testing "Message successful on non-existent message does not fail"
      (is (nil? (q.backend/batch-successful! :queue.backend/appdb queue-name 99999))))))

;; Note: no cleanup needed — batch-successful! deletes the row

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
          (q.backend/batch-failed! :queue.backend/appdb queue-name message-id)
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
          (q.backend/batch-failed! :queue.backend/appdb queue-name message-id)
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
          (q.backend/batch-failed! :queue.backend/appdb queue-name message-id)
          (let [updated-message (t2/select-one :queue_message_batch :id message-id)]
            (is (= "failed" (:status updated-message)))
            (is (= (mq.settings/queue-max-retries) (:failures updated-message)))
            (is (nil? (:owner updated-message))))))

      (testing "Message failed on non-existent message does not fail"
        (is (nil? (q.backend/batch-failed! :queue.backend/appdb queue-name 99999))))

      (testing "Message failed when being processed by another node is a no-op"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name (name queue-name)
                                                   :messages (json/encode ["test-message"])
                                                   :status "processing"
                                                   :owner "another-node"
                                                   :failures 0})]
          (q.backend/batch-failed! :queue.backend/appdb queue-name message-id)
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
          (is (pos? (#'q.appdb/recover-stale-processing-batches!)))
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
          (is (pos? (#'q.appdb/recover-stale-processing-batches!)))
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
          (#'q.appdb/recover-stale-processing-batches!)
          (let [row (t2/select-one :queue_message_batch :id message-id)]
            (is (= "processing" (:status row)))
            (is (= 0 (:failures row))))))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))

(deftest heartbeat-test
  (let [queue-name (keyword "queue" (str "heartbeat-test-" (random-uuid)))]
    (try
      (let [message-id         (t2/insert-returning-pk! :queue_message_batch
                                                        {:queue_name (name queue-name)
                                                         :messages   (json/encode ["msg"])
                                                         :status     "processing"
                                                         :owner      @#'q.appdb/owner-id})
            original-heartbeat (:status_heartbeat (t2/select-one :queue_message_batch :id message-id))]
        (Thread/sleep 100) ; Ensure enough time passes for timestamp to differ
        (with-redefs [mq.impl/busy-channels          (constantly #{queue-name})
                      mq.impl/active-handler-metadata (fn [_ch] {:batch-id message-id})]
          (#'q.appdb/update-heartbeats!))
        (testing "Heartbeat is updated after update-heartbeats!"
          (let [updated-heartbeat (:status_heartbeat (t2/select-one :queue_message_batch :id message-id))]
            (is (not= original-heartbeat updated-heartbeat)
                "Heartbeat timestamp should be updated"))))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))

(deftest cleanup-failed-batches-test
  (let [queue-name (keyword "queue" (str "cleanup-test-" (random-uuid)))
        old-ts     (Timestamp/from (.minusMillis (Instant/now) (+ (* 7 24 60 60 1000) 60000)))]
    (try
      (testing "Failed batch older than 7 days is deleted"
        (let [old-id (t2/insert-returning-pk! :queue_message_batch
                                              {:queue_name       (name queue-name)
                                               :messages         (json/encode ["old-msg"])
                                               :status           "failed"
                                               :status_heartbeat old-ts})]
          (#'q.appdb/cleanup-failed-batches!)
          (is (nil? (t2/select-one :queue_message_batch :id old-id))
              "Old failed batch should be deleted")))

      (testing "Recent failed batch is not deleted"
        (let [recent-id (t2/insert-returning-pk! :queue_message_batch
                                                 {:queue_name (name queue-name)
                                                  :messages   (json/encode ["recent-msg"])
                                                  :status     "failed"})]
          (#'q.appdb/cleanup-failed-batches!)
          (is (some? (t2/select-one :queue_message_batch :id recent-id))
              "Recent failed batch should not be deleted")
          (t2/delete! :queue_message_batch :id recent-id)))

      (testing "Non-failed batch with old heartbeat is not cleaned up"
        (let [pending-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name       (name queue-name)
                                                   :messages         (json/encode ["pending-msg"])
                                                   :status           "pending"
                                                   :status_heartbeat old-ts})]
          (#'q.appdb/cleanup-failed-batches!)
          (is (some? (t2/select-one :queue_message_batch :id pending-id))
              "Non-failed batch should not be deleted")
          (t2/delete! :queue_message_batch :id pending-id)))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))

(deftest update-depth-gauges-test
  (let [queue-name  (keyword "queue" (str "depth-gauge-test-" (random-uuid)))
        gauge-calls (atom [])]
    (try
      (t2/insert! :queue_message_batch {:queue_name (name queue-name) :messages (json/encode ["m1"]) :status "pending"})
      (t2/insert! :queue_message_batch {:queue_name (name queue-name) :messages (json/encode ["m2"]) :status "failed"})
      (with-redefs [mq.analytics/set! (fn [metric labels value]
                                        (when (= metric :metabase-mq/appdb-queue-depth)
                                          (swap! gauge-calls conj {:labels labels :value value})))]
        (#'q.appdb/update-depth-gauges!))
      (testing "Gauge is emitted for each queue/status combination"
        (let [calls-for-queue (filter #(= (name queue-name) (-> % :labels :channel)) @gauge-calls)
              by-status       (into {} (map (juxt #(-> % :labels :status) :value)) calls-for-queue)]
          (is (= 1 (get by-status "pending")) "Should count 1 pending message")
          (is (= 1 (get by-status "failed")) "Should count 1 failed message")))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))
