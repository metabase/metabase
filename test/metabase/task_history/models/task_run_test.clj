(ns metabase.task-history.models.task-run-test
  "Tests for TaskRun model and with-task-run macro."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.models.interface :as mi]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.pulse.send :as pulse.send]
   [metabase.pulse.test-util :as pulse.tu]
   [metabase.sync.util :as sync-util]
   [metabase.task-history.core :as task-history]
   [metabase.task-history.models.task-run :as task-run]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            with-task-run basic tests                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest with-task-run-creates-run-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "with-task-run creates a task run record"
      (task-history/with-task-run {:run_type    :sync
                                   :entity_type :database
                                   :entity_id   1}
        (is (some? (task-history/current-run-id)) "run-id is bound")
        (let [run (t2/select-one :model/TaskRun :id (task-history/current-run-id))]
          (is (= :started (:status run)) "status is :started during execution")
          (is (= :sync (:run_type run)))
          (is (= :database (:entity_type run)))
          (is (= 1 (:entity_id run))))))))

(deftest with-task-run-auto-complete-success-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "with-task-run auto-completes with :success when children all succeed"
      (let [run-id (atom nil)]
        (task-history/with-task-run {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   1}
          (reset! run-id (task-history/current-run-id))
          (task-history/with-task-history {:task "test-task-1"}
            :done)
          (task-history/with-task-history {:task "test-task-2"}
            :done))
        (let [run (t2/select-one :model/TaskRun :id @run-id)]
          (is (= :success (:status run)))
          (is (some? (:ended_at run))))))))

(deftest with-task-run-auto-complete-failure-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "with-task-run auto-completes with :failed when any child fails"
      (let [run-id (atom nil)]
        (try
          (task-history/with-task-run {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   1}
            (reset! run-id (task-history/current-run-id))
            (task-history/with-task-history {:task "test-task-1"}
              :done)
            (task-history/with-task-history {:task "test-task-2"}
              (throw (Exception. "fail"))))
          (catch Exception _))
        (let [run (t2/select-one :model/TaskRun :id @run-id)]
          (is (= :failed (:status run)))
          (is (some? (:ended_at run))))))))

(deftest with-task-run-auto-complete-false-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "with :auto-complete false and no work for other threads, with-task-run completes the run after its body"
      (let [run-id (task-history/with-task-run {:run_type      :subscription
                                                :entity_type   :dashboard
                                                :entity_id     1
                                                :auto-complete false}
                     (task-history/with-task-history {:task "test-task"}
                       :done)
                     (task-history/current-run-id))
            run    (t2/select-one :model/TaskRun :id run-id)]
        (is (= :success (:status run)))
        (is (some? (:ended_at run)))))
    (testing "work on another thread that fails makes the run failed when it ends"
      (let [[run-id send] (task-history/with-task-run {:run_type      :subscription
                                                       :entity_type   :dashboard
                                                       :entity_id     1
                                                       :auto-complete false}
                            [(task-history/current-run-id)
                             (task-history/track-run-work! {:send 1})])]
        (is (= :started (t2/select-one-fn :status :model/TaskRun :id run-id)))
        (task-history/with-restored-run-id send
          (try
            (task-history/with-task-history {:task "send"}
              (throw (Exception. "fail")))
            (catch Exception _)))
        (is (= :failed (t2/select-one-fn :status :model/TaskRun :id run-id)))))))

(deftest task-run-pending-work-test
  (testing "an :auto-complete false run stays started until its body and all work tagged with its run id have ended (GDGT-3331)"
    (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
      (let [[run-id send-1 send-2] (task-history/with-task-run {:run_type      :subscription
                                                                :entity_type   :dashboard
                                                                :entity_id     1
                                                                :auto-complete false}
                                     [(task-history/current-run-id)
                                      (task-history/track-run-work! {:send 1})
                                      (task-history/track-run-work! {:send 2})])
            run-status             #(t2/select-one-fn :status :model/TaskRun :id run-id)]
        (is (= :started (run-status)) "the body has ended, two sends have not")
        ;; as the queue does when a newer notification replaces `send-1`
        (task-history/end-run-work! send-1)
        (is (= :started (run-status)) "one send has not ended")
        ;; as the notification worker does
        (task-history/with-restored-run-id send-2
          (task-history/with-task-history {:task "send"}
            :done))
        (is (= :success (run-status)) "the last send sets the run status")))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Nesting prevention tests                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest with-task-run-prevents-nesting-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "nested with-task-run does not create a new run"
      (let [outer-run-id (atom nil)
            inner-run-id (atom nil)]
        (task-history/with-task-run {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   1}
          (reset! outer-run-id (task-history/current-run-id))
          (task-history/with-task-run {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   2}
            (reset! inner-run-id (task-history/current-run-id))))
        (is (= @outer-run-id @inner-run-id) "inner run uses same run-id")
        (is (= 1 (t2/count :model/TaskRun)) "only one run created")))))

(deftest with-task-run-nil-info-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "with-task-run with nil run-info just executes body"
      (task-history/with-task-run nil
        (is (nil? (task-history/current-run-id)) "run-id remains nil"))
      (is (zero? (t2/count :model/TaskRun)) "no run created"))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          complete-task-run! tests                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest complete-task-run-derives-status-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "complete-task-run! derives :success when all children succeed"
      (let [run-id (task-run/create-task-run! {:run_type    :sync
                                               :entity_type :database
                                               :entity_id   1})]
        (mt/with-dynamic-fn-redefs [task-run/current-run-id (constantly run-id)]
          (task-history/with-task-history {:task "t1"} :ok)
          (task-history/with-task-history {:task "t2"} :ok))
        (#'task-run/complete-task-run! run-id)
        (is (= :success (:status (t2/select-one :model/TaskRun :id run-id))))))
    (testing "complete-task-run! derives :failed when any child failed"
      (let [run-id (task-run/create-task-run! {:run_type    :sync
                                               :entity_type :database
                                               :entity_id   1})]
        (mt/with-dynamic-fn-redefs [task-run/current-run-id (constantly run-id)]
          (task-history/with-task-history {:task "t1"} :ok)
          (try
            (task-history/with-task-history {:task "t2"}
              (throw (Exception. "fail")))
            (catch Exception _)))
        (#'task-run/complete-task-run! run-id)
        (is (= :failed (:status (t2/select-one :model/TaskRun :id run-id))))))))

(deftest complete-task-run-idempotent-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "complete-task-run! is idempotent - only updates if status is :started"
      (let [run-id (task-run/create-task-run! {:run_type    :sync
                                               :entity_type :database
                                               :entity_id   1})]
        (mt/with-dynamic-fn-redefs [task-run/current-run-id (constantly run-id)]
          (task-history/with-task-history {:task "t1"} :ok))
        ;; First completion
        (#'task-run/complete-task-run! run-id)
        (let [first-ended-at (:ended_at (t2/select-one :model/TaskRun :id run-id))]
          (is (= :success (:status (t2/select-one :model/TaskRun :id run-id))))
          ;; Add a failing task and try to complete again
          (mt/with-dynamic-fn-redefs [task-run/current-run-id (constantly run-id)]
            (try
              (task-history/with-task-history {:task "t2"}
                (throw (Exception. "fail")))
              (catch Exception _)))
          ;; Second completion should be no-op
          (#'task-run/complete-task-run! run-id)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            (is (= :success (:status run)) "status unchanged")
            (is (= first-ended-at (:ended_at run)) "ended_at unchanged")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       run-id propagation (async) tests                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest run-id-meta-propagation-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "track-run-work! and with-restored-run-id propagate run-id via metadata"
      (let [restored-run (atom nil)]
        (task-history/with-task-run {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   1}
          (let [data            (task-history/track-run-work! {:some "data"})
                original-run-id (task-history/current-run-id)]
            (is (some? original-run-id) "run-id is set")
            (is (true? (:auto-complete? task-run/*run*)) "with-task-run completes this run itself")
            (task-history/with-restored-run-id data
              (reset! restored-run task-run/*run*))
            (is (= {:id original-run-id :auto-complete? true} @restored-run)
                "the restored run has the id from the metadata, and it completes itself, as the original run does")
            (is (= :started (t2/select-one-fn :status :model/TaskRun :id original-run-id))
                "the map was not counted, so the restore does not complete the run (GDGT-3331)")))))))

(deftest restored-run-counts-like-its-run-test
  (testing "work queued on a worker for a run that completes itself is not counted, so it cannot complete that run early (GDGT-3331)"
    (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
      (task-history/with-task-run {:run_type    :subscription
                                   :entity_type :dashboard
                                   :entity_id   1}
        (let [run-id (task-history/current-run-id)
              queued (task-history/track-run-work! {:send 1})]
          ;; as a worker that sends `queued`, and queues one more notification while it sends
          (task-history/with-restored-run-id queued
            (task-history/end-run-work! (task-history/track-run-work! {:send 2})))
          (is (= :started (t2/select-one-fn :status :model/TaskRun :id run-id))
              "with-task-run completes the run after its body"))))))

(deftest run-id-meta-nil-propagation-test
  (testing "with-restored-run-id handles nil metadata gracefully"
    (let [data {}]
      (task-history/with-restored-run-id data
        (is (nil? (task-history/current-run-id)) "run-id is nil when not in metadata")))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      task_history.run_id integration                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest task-history-gets-run-id-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "task history created within with-task-run gets run_id populated"
      (let [task-name (mt/random-name)]
        (task-history/with-task-run {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   1}
          (task-history/with-task-history {:task task-name}
            :done))
        (let [th (t2/select-one :model/TaskHistory :task task-name)]
          (is (some? (:run_id th)) "run_id is set"))))
    (testing "task history created outside with-task-run has nil run_id"
      (let [task-name (mt/random-name)]
        (task-history/with-task-history {:task task-name}
          :done)
        (let [th (t2/select-one :model/TaskHistory :task task-name)]
          (is (nil? (:run_id th)) "run_id is nil"))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Sync integration tests                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest sync-creates-task-run-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "sync-operation creates a task run with type :sync"
      (let [mock-db    (mi/instance :model/Database {:name "test" :id 999 :engine :h2})
            step-name  (mt/random-name)
            sync-steps [(sync-util/create-sync-step step-name (fn [_] {:total-tables 1}))]]
        (sync-util/sync-operation :sync-metadata mock-db "Test sync"
          (sync-util/run-sync-operation "test-sync" mock-db sync-steps))
        (let [run (t2/select-one :model/TaskRun :entity_type :database :entity_id 999)]
          (is (some? run) "task run was created")
          (is (= :sync (:run_type run)))
          (is (= :database (:entity_type run)))
          (is (= 999 (:entity_id run)))
          (is (= :success (:status run))))))))

(deftest analyze-creates-fingerprint-run-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "analyze operation creates a task run with type :fingerprint"
      (let [mock-db    (mi/instance :model/Database {:name "test" :id 998 :engine :h2})
            step-name  (mt/random-name)
            sync-steps [(sync-util/create-sync-step step-name (fn [_] {:total-tables 1}))]]
        (sync-util/sync-operation :analyze mock-db "Test analyze"
          (sync-util/run-sync-operation "test-analyze" mock-db sync-steps))
        (let [run (t2/select-one :model/TaskRun :entity_type :database :entity_id 998)]
          (is (some? run) "task run was created")
          (is (= :fingerprint (:run_type run)))
          (is (= :success (:status run))))))))

(deftest nested-sync-operations-share-run-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "nested sync operations don't create multiple task runs"
      (let [mock-db     (mi/instance :model/Database {:name "test" :id 997 :engine :h2})
            outer-step  (mt/random-name)
            inner-step  (mt/random-name)
            outer-steps [(sync-util/create-sync-step outer-step
                                                     (fn [_]
                                                       ;; Nested sync operation
                                                       (sync-util/sync-operation :sync mock-db "Inner sync"
                                                         (sync-util/run-sync-operation "inner"
                                                                                       mock-db
                                                                                       [(sync-util/create-sync-step inner-step (fn [_] {:total-tables 1}))]))
                                                       {:total-tables 1}))]]
        (sync-util/sync-operation :sync mock-db "Outer sync"
          (sync-util/run-sync-operation "outer" mock-db outer-steps))
        (is (= 1 (t2/count :model/TaskRun :entity_id 997))
            "only one task run created for nested operations")))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Pulse integration tests                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest pulse->task-run-info-test
  (testing "pulse->task-run-info extracts correct info"
    (testing "dashboard subscription"
      (is (= {:run_type :subscription :entity_type :dashboard :entity_id 123}
             (pulse.send/pulse->task-run-info {:dashboard_id 123}))))
    (testing "legacy pulse with cards"
      (is (= {:run_type :subscription :entity_type :card :entity_id 456}
             (pulse.send/pulse->task-run-info {:cards [{:id 456} {:id 789}]}))))
    (testing "pulse with neither returns nil"
      (is (nil? (pulse.send/pulse->task-run-info {}))))))

(deftest pulse-send-creates-task-run-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "sending a dashboard pulse creates a task run with type :subscription"
      (notification.tu/with-notification-testing-setup!
        (notification.tu/with-channel-fixtures [:channel/email]
          (mt/with-temp [:model/Dashboard    {dash-id :id} {:name "Test Dashboard"}
                         :model/Card         {card-id :id} {:name "Test Card"}
                         :model/Pulse        {pulse-id :id} {:name         "Test Pulse"
                                                             :dashboard_id dash-id}
                         :model/PulseCard    _ {:pulse_id pulse-id
                                                :card_id  card-id
                                                :position 0}
                         :model/PulseChannel {pc-id :id} {:pulse_id     pulse-id
                                                          :channel_type "email"}
                         :model/PulseChannelRecipient _ {:user_id          (pulse.tu/rasta-id)
                                                         :pulse_channel_id pc-id}]
            (notification.tu/with-javascript-visualization-stub
              (pulse.tu/with-captured-channel-send-messages!
                (pulse.send/send-pulse! (t2/select-one :model/Pulse pulse-id))))
            (let [run (t2/select-one :model/TaskRun :entity_type :dashboard :entity_id dash-id)]
              (is (some? run) "task run was created")
              (is (= :subscription (:run_type run)))
              (is (= :dashboard (:entity_type run)))
              (is (#{:success :failed} (:status run)) "task run completed"))))))))

(deftest pulse-send-run-fails-when-a-later-channel-fails-test
  (testing "a test send to two channels records the run as failed when the second channel fails after the first delivered (GDGT-3331)"
    (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
      (notification.tu/with-notification-testing-setup!
        (mt/with-temp [:model/Dashboard    {dash-id :id}  {:name "Test Dashboard"}
                       :model/Pulse        {pulse-id :id} {:name         "Test Pulse"
                                                           :dashboard_id dash-id}
                       :model/PulseChannel _ {:pulse_id     pulse-id
                                              :channel_type "email"
                                              :details      {:emails ["foo@metabase.com"]}}
                       :model/PulseChannel _ {:pulse_id     pulse-id
                                              :channel_type "slack"
                                              :details      {:channel "#general"}}]
          ;; the channels come in the pulse's channel order, which the test does not fix, so fail the second render
          (let [renders (atom 0)]
            (with-redefs [channel/render-notification (fn [& _]
                                                        (if (= 1 (swap! renders inc))
                                                          [{:stub-message true}]
                                                          (throw (ex-info "second channel failed" {}))))
                          channel/send!               (constantly nil)]
              (is (thrown? clojure.lang.ExceptionInfo
                           (pulse.send/send-pulse! (t2/select-one :model/Pulse pulse-id))))))
          (let [run (t2/select-one :model/TaskRun :entity_type :dashboard :entity_id dash-id)]
            (is (= {:success 1 :failed 1}
                   (frequencies (t2/select-fn-vec :status :model/TaskHistory :run_id (:id run) :task "notification-send"))))
            (is (= :failed (:status run)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Notification integration tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest notification-send-creates-task-run-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "sending a card notification creates a task run with type :alert"
      (notification.tu/with-notification-testing-setup!
        (notification.tu/with-channel-fixtures [:channel/email]
          (notification.tu/with-card-notification
            [notification {:handlers [{:channel_type :channel/email
                                       :recipients   [{:type :notification-recipient/user
                                                       :user_id (mt/user->id :crowberto)}]}]}]
            (let [card-id (-> notification :payload :card_id)]
              (notification.tu/with-javascript-visualization-stub
                (notification.tu/with-mock-inbox-email!
                  (notification.send/send-notification! notification :notification/sync? true)))
              (let [run (t2/select-one :model/TaskRun :entity_type :card :entity_id card-id)]
                (is (some? run) "task run was created")
                (is (= :alert (:run_type run)))
                (is (= :card (:entity_type run)))
                (is (#{:success :failed} (:status run)) "task run completed")))))))))

(deftest notification->task-run-info-test
  (testing "notification->task-run-info extracts correct info"
    (testing "card notification (alert) is attributed to the notification id"
      (is (= {:run_type :alert :entity_type :card :entity_id 123 :notification_id 7}
             (notification.send/notification->task-run-info
              {:id           7
               :payload_type :notification/card
               :payload      {:card_id 123}}))))
    (testing "card notification with nil card_id returns nil"
      (is (nil? (notification.send/notification->task-run-info
                 {:payload_type :notification/card
                  :payload      {:card_id nil}}))))
    (testing "dashboard notification (subscription) is attributed to the notification id"
      (is (= {:run_type :subscription :entity_type :dashboard :entity_id 456 :notification_id 9}
             (notification.send/notification->task-run-info
              {:id           9
               :payload_type :notification/dashboard
               :payload      {:dashboard_id 456}}))))
    (testing "dashboard notification with nil dashboard_id returns nil"
      (is (nil? (notification.send/notification->task-run-info
                 {:payload_type :notification/dashboard
                  :payload      {:dashboard_id nil}}))))
    (testing "system-event notification returns nil"
      (is (nil? (notification.send/notification->task-run-info
                 {:payload_type :notification/system-event
                  :payload      {}}))))
    (testing "testing notification returns nil"
      (is (nil? (notification.send/notification->task-run-info
                 {:payload_type :notification/testing
                  :payload      {}}))))))
