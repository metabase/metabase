(ns metabase.mq.queue.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)))

(set! *warn-on-reflection* true)

(deftest publish-test
  (let [queue-name (keyword "queue" (str (gensym "publish-test-")))]
    (try
      (q.backend/publish! q.appdb/backend queue-name (json/encode ["test message"]))
      (testing "Messages are persisted in the queue"
        (let [row (t2/select-one :queue_message_batch :queue_name (name queue-name))]
          (is (= ["test message"] (json/decode (:payload row))))
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
            (is (nil? (q.backend/fetch! q.appdb/backend (listener/queue-names)))))

          (t2/insert! :queue_message_batch
                      {:queue_name (name invalid-queue)
                       :payload   (json/encode ["invalid"])})
          (t2/insert! :queue_message_batch
                      {:queue_name (name queue1)
                       :payload   (json/encode ["data1"])})
          (t2/insert! :queue_message_batch
                      {:queue_name (name queue2)
                       :payload   (json/encode ["data2"])})

          (testing "Returns nil if no queues are defined"
            (binding [listener/*listeners* (atom {})]
              (is (nil? (q.backend/fetch! q.appdb/backend (listener/queue-names))))))
          (testing "Fetches one row per queue in a single call"
            (let [results (q.backend/fetch! q.appdb/backend (listener/queue-names))
                  by-queue (into {} (map (juxt :queue identity)) results)]
              (is (= 2 (count results)))
              (testing "queue1 row"
                (let [{:keys [batch-id payload]} (get by-queue queue1)]
                  (is (pos-int? batch-id))
                  (is (= ["data1"] (json/decode payload)))
                  (testing "Fetched row gets marked as processing"
                    (let [updated-row (t2/select-one :queue_message_batch :id batch-id)]
                      (is (= "processing" (:status updated-row)))
                      (is (not= (:created_at updated-row) (:status_heartbeat updated-row)))
                      (is (= 0 (:failures updated-row)))
                      (is (= (:id (:poll-context q.appdb/backend)) (:owner updated-row)))))))
              (testing "queue2 row"
                (let [{:keys [batch-id payload]} (get by-queue queue2)]
                  (is (pos-int? batch-id))
                  (is (= ["data2"] (json/decode payload)))))))
          (testing "When everything valid is processing, return nil"
            (is (nil? (q.backend/fetch! q.appdb/backend (listener/queue-names))))))
        (finally
          (t2/delete! :queue_message_batch :queue_name [:in [(name queue1) (name queue2) (name invalid-queue)]]))))))

(deftest exclusive-fetch-test
  (let [exclusive-q (keyword "queue" (str "exclusive-" (random-uuid)))
        normal-q    (keyword "queue" (str "normal-" (random-uuid)))]
    (binding [listener/*listeners* (atom {exclusive-q {:listener identity}
                                          normal-q    {:listener identity}})
              q.registry/*queues*  (atom {exclusive-q {:exclusive true}
                                          normal-q    {}})]
      (try
        (t2/with-connection [_conn]
          (testing "With no processing rows, exclusive queue messages are fetched normally"
            (t2/insert! :queue_message_batch
                        {:queue_name (name exclusive-q)
                         :payload   (json/encode ["exclusive-msg1"])})
            (let [results (q.backend/fetch! q.appdb/backend (listener/queue-names))
                  {:keys [queue payload]} (first results)]
              (is (= 1 (count results)))
              (is (= exclusive-q queue))
              (is (= ["exclusive-msg1"] (json/decode payload)))))

          (testing "With a processing row on exclusive queue, fetch skips it"
            (t2/insert! :queue_message_batch
                        {:queue_name (name exclusive-q)
                         :payload   (json/encode ["exclusive-msg2"])})
            ;; The first message is now 'processing', so the second should be skipped
            (is (nil? (q.backend/fetch! q.appdb/backend (listener/queue-names)))
                "Should return nil because exclusive queue has a processing row"))

          (testing "Non-exclusive queue is still fetchable even when exclusive queue is blocked"
            (t2/insert! :queue_message_batch
                        {:queue_name (name normal-q)
                         :payload   (json/encode ["normal-msg1"])})
            (let [results (q.backend/fetch! q.appdb/backend (listener/queue-names))
                  {:keys [queue payload]} (first results)]
              (is (= 1 (count results)))
              (is (= normal-q queue))
              (is (= ["normal-msg1"] (json/decode payload)))))

          (testing "After exclusive processing completes, next message can be fetched"
            ;; Mark the processing row as done by deleting it (simulating batch-successful!)
            (t2/delete! :queue_message_batch :queue_name (name exclusive-q) :status "processing")
            (let [results (q.backend/fetch! q.appdb/backend (listener/queue-names))
                  {:keys [queue payload]} (first results)]
              (is (= exclusive-q queue))
              (is (= ["exclusive-msg2"] (json/decode payload))))))
        (finally
          (t2/delete! :queue_message_batch :queue_name [:in [(name exclusive-q) (name normal-q)]]))))))

(deftest message-successful-test
  (let [queue-name (keyword "queue" (str (gensym "successful-test-")))]
    (testing "Message successful deletes the message"
      (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                {:queue_name (name queue-name)
                                                 :payload (json/encode ["test-message"])
                                                 :status "processing"
                                                 :owner (:id (:poll-context q.appdb/backend))})]
        (q.backend/batch-successful! q.appdb/backend queue-name message-id)
        (is (nil? (t2/select-one :queue_message_batch :id message-id)))))

    (testing "Message successful on non-existent message does not fail"
      (is (nil? (q.backend/batch-successful! q.appdb/backend queue-name 99999))))))

;; Note: no cleanup needed — batch-successful! deletes the row

(deftest failure-handling-test
  (let [queue-name (keyword "queue" (str (gensym "failed-test-")))
        owner      (:id (:poll-context q.appdb/backend))
        mk-row     (fn [failures]
                     (t2/insert-returning-pk! :queue_message_batch
                                              {:queue_name (name queue-name)
                                               :payload   (json/encode ["m"])
                                               :status     "processing"
                                               :failures   failures
                                               :owner      owner}))]
    (try
      (testing "failure-count returns the stored failure count"
        (is (= 2 (q.backend/failure-count q.appdb/backend queue-name (mk-row 2)))))

      (testing "failure-count is nil for an unknown message (caller no-ops)"
        (is (nil? (q.backend/failure-count q.appdb/backend queue-name 99999))))

      (testing "failure-count is nil when another node owns the message"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name (name queue-name)
                                                   :payload   (json/encode ["m"])
                                                   :status     "processing"
                                                   :owner      "another-node"
                                                   :failures   0})]
          (is (nil? (q.backend/failure-count q.appdb/backend queue-name message-id)))
          (testing "and retry-batch! leaves the other node's row untouched"
            (q.backend/retry-batch! q.appdb/backend queue-name message-id)
            (let [row (t2/select-one :queue_message_batch :id message-id)]
              (is (= "processing" (:status row)))
              (is (= 0 (:failures row)))
              (is (= "another-node" (:owner row)))))))

      (testing "retry-batch! resets to pending and increments failures"
        (let [message-id (mk-row 2)]
          (q.backend/retry-batch! q.appdb/backend queue-name message-id)
          (let [row (t2/select-one :queue_message_batch :id message-id)]
            (is (= "pending" (:status row)))
            (is (= 3 (:failures row)))
            (is (nil? (:owner row)))
            (is (some? (:status_heartbeat row))))))

      (testing "fail-batch! deletes the message (failed batches aren't retained)"
        (let [message-id (mk-row 2)]
          (q.backend/fail-batch! q.appdb/backend queue-name message-id)
          (is (nil? (t2/select-one :queue_message_batch :id message-id)))))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))

(deftest max-retries-decision-test
  (testing "the shared delivery layer retries below max-retries and fails permanently at max"
    (let [queue-name (keyword "queue" (str (gensym "decision-test-")))
          owner      (:id (:poll-context q.appdb/backend))
          mk-row     (fn [failures]
                       (t2/insert-returning-pk! :queue_message_batch
                                                {:queue_name (name queue-name)
                                                 :payload   (json/encode ["m"])
                                                 :status     "processing"
                                                 :failures   failures
                                                 :owner      owner}))]
      (try
        (testing "below max retries -> re-queued as pending"
          (let [id (mk-row 0)]
            (#'mq.impl/handle-batch-failure! q.appdb/backend queue-name id)
            (is (= "pending" (:status (t2/select-one :queue_message_batch :id id))))))
        (testing "at max retries -> dropped (deleted)"
          (let [id (mk-row (dec (mq.settings/queue-max-retries)))]
            (#'mq.impl/handle-batch-failure! q.appdb/backend queue-name id)
            (is (nil? (t2/select-one :queue_message_batch :id id)))))
        (finally
          (t2/delete! :queue_message_batch :queue_name (name queue-name)))))))

(deftest recover-stale-processing-batches-test
  (let [queue-name      (keyword "queue" (str "stale-test-" (random-uuid)))
        stale-ms        (* 10 60 1000)
        max-retries     (mq.settings/queue-max-retries)
        stale-heartbeat (Timestamp/from (.minusMillis (Instant/now) (+ stale-ms 60000)))]
    (try
      (testing "Stale processing batch is reset to pending with incremented failures"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name       (name queue-name)
                                                   :payload         (json/encode ["stale-msg"])
                                                   :status           "processing"
                                                   :status_heartbeat stale-heartbeat
                                                   :failures         1
                                                   :owner            "dead-owner"})]
          (let [recovered (->> (q.backend/recover-stale! q.appdb/backend stale-ms max-retries)
                               (filter #(= (name queue-name) (:channel %)))
                               (keep :recovered)
                               (reduce + 0))]
            (is (pos? recovered) "recover-stale! reports the recovered batch for this channel"))
          (let [row (t2/select-one :queue_message_batch :id message-id)]
            (is (= "pending" (:status row)))
            (is (= 2 (:failures row)))
            (is (nil? (:owner row))))))

      (testing "Stale batch at max retries is dropped (deleted)"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name       (name queue-name)
                                                   :payload         (json/encode ["stale-msg-max"])
                                                   :status           "processing"
                                                   :status_heartbeat stale-heartbeat
                                                   :failures         (dec (mq.settings/queue-max-retries))
                                                   :owner            "dead-owner"})]
          (let [failed (->> (q.backend/recover-stale! q.appdb/backend stale-ms max-retries)
                            (filter #(= (name queue-name) (:channel %)))
                            (keep :failed)
                            (reduce + 0))]
            (is (pos? failed) "recover-stale! reports the permanently-failed batch for this channel"))
          (is (nil? (t2/select-one :queue_message_batch :id message-id))
              "exhausted stale batch is deleted")))

      (testing "Recent processing batch is not recovered by stale check"
        (let [message-id (t2/insert-returning-pk! :queue_message_batch
                                                  {:queue_name       (name queue-name)
                                                   :payload         (json/encode ["recent-msg"])
                                                   :status           "processing"
                                                   :failures         0
                                                   :owner            "active-owner"})]
          (q.backend/recover-stale! q.appdb/backend stale-ms max-retries)
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
                                                         :payload   (json/encode ["msg"])
                                                         :status     "processing"
                                                         :owner      (:id (:poll-context q.appdb/backend))})
            original-heartbeat (:status_heartbeat (t2/select-one :queue_message_batch :id message-id))]
        (Thread/sleep 100) ; Ensure enough time passes for timestamp to differ
        (mt/with-dynamic-fn-redefs [mq.impl/busy-channels          (constantly #{queue-name})
                                    mq.impl/active-handler-metadata (fn [_ch] {:batch-id message-id})]
          (q.backend/run-heartbeats! q.appdb/backend))
        (testing "Heartbeat is updated after run-heartbeats!"
          (let [updated-heartbeat (:status_heartbeat (t2/select-one :queue_message_batch :id message-id))]
            (is (not= original-heartbeat updated-heartbeat)
                "Heartbeat timestamp should be updated"))))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))

(deftest queue-depths-test
  (let [queue-name (keyword "queue" (str "depth-gauge-test-" (random-uuid)))]
    (try
      (t2/insert! :queue_message_batch {:queue_name (name queue-name) :payload (json/encode ["m1"]) :status "pending"})
      (t2/insert! :queue_message_batch {:queue_name (name queue-name) :payload (json/encode ["m2"]) :status "processing"})
      (testing "queue-depths returns a {:channel :status :count} row per queue/status combination"
        (let [by-status (into {}
                              (comp (filter #(= (name queue-name) (:channel %)))
                                    (map (juxt :status :count)))
                              (q.backend/queue-depths q.appdb/backend))]
          (is (= 1 (get by-status "pending")) "Should count 1 pending message")
          (is (= 1 (get by-status "processing")) "Should count 1 processing message")))
      (finally
        (t2/delete! :queue_message_batch :queue_name (name queue-name))))))
