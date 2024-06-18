(ns ^:mb/once metabase.sync.util-test
  "Tests for the utility functions shared by all parts of sync, such as the duplicate ops guard."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.models.database :as database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.models.table :refer [Table]]
   [metabase.models.task-history :as task-history :refer [TaskHistory]]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Duplicate Sync Prevention                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that we prevent running simultaneous syncs on the same database

(defonce ^:private calls-to-describe-database (atom 0))

(driver/register! ::concurrent-sync-test, :abstract? true)

(defmethod driver/describe-database ::concurrent-sync-test [& _]
  (swap! calls-to-describe-database inc)
  (Thread/sleep 1000)
  {:tables #{}})

(defmethod driver/describe-table ::concurrent-sync-test [& _] nil)

(defmethod driver/table-rows-seq ::concurrent-sync-test [& _] [])

(deftest concurrent-sync-test
  (testing "only one sync process be going on at a time"
    ;; describe-database gets called once during a single sync process, and the results are used for syncing tables
    ;; and syncing the _metabase_metadata table.
    (t2.with-temp/with-temp [Database db {:engine ::concurrent-sync-test}]
      (reset! calls-to-describe-database 0)
      ;; start a sync processes in the background. It should take 1000 ms to finish
      (let [f1 (future (sync/sync-database! db))
            f2 (do
                 ;; wait 200 ms to make sure everything is going
                 (Thread/sleep 200)
                 ;; Start another in the background. Nothing should happen here because the first is already running
                 (future (sync/sync-database! db)))]
        ;; Start another in the foreground. Again, nothing should happen here because the original should still be
        ;; running
        (sync/sync-database! db)
        ;; make sure both of the futures have finished
        (deref f1)
        (deref f2)
        (is (= 1 @calls-to-describe-database))))))

(defn- call-with-operation-info!
  "Call `f` with `log-sync-summary` and `store-sync-summary!` redef'd. For `log-sync-summary`, it intercepts the step
  metadata before the information is logged. For `store-sync-summary!` it will return the IDs for the newly created
  TaskHistory rows. This is useful to validate that the metadata and history is correct as the message might not be
  logged at all (depending on the logging level) or not stored."
  [f]
  (let [step-info-atom           (atom [])
        created-task-history-ids (atom [])
        orig-log-fn              @#'sync-util/log-sync-summary
        origin-update-th!        @#'task-history/update-task-history!]
    (with-redefs [sync-util/log-sync-summary        (fn [operation database operation-metadata]
                                                      (swap! step-info-atom conj operation-metadata)
                                                      (orig-log-fn operation database operation-metadata))

                  task-history/update-task-history! (fn [th-id startime-ms info]
                                                      (swap! created-task-history-ids conj th-id)
                                                      (origin-update-th! th-id startime-ms info))]
      (f))
    {:operation-results @step-info-atom
     :task-history-ids  @created-task-history-ids}))

(defn sync-database!
  "Calls `sync-database!` and returns the the metadata for `step` as the result along with the `TaskHistory` for that
  `step`. This function is useful for validating that each step's metadata correctly reflects the changes that were
  made via a test scenario."
  [step db]
  (let [{:keys [operation-results task-history-ids]} (call-with-operation-info! #(sync/sync-database! db))]
    {:step-info    (-> (into {} (mapcat :steps operation-results))
                       (get step))
     :task-history (when (seq task-history-ids)
                     (t2/select-one TaskHistory :id [:in task-history-ids]
                                    :task [:= step]))}))

(defn only-step-keys
  "This function removes the generic keys for the step metadata, returning only the step specific keypairs to make
  validating the results for the given step easier."
  [step-info]
  (dissoc step-info :start-time :end-time :log-summary-fn))

(defn- validate-times [{:keys [start-time end-time]}]
  (every? (partial instance? java.time.temporal.Temporal) [start-time end-time]))

(def ^:private default-task-history
  {:id true, :db_id true, :started_at true, :ended_at true :status :success})

(defn- fetch-task-history-row [task-name]
  (let [task-history (t2/select-one TaskHistory :task task-name)]
    (assert (integer? (:duration task-history)))
    (tu/boolean-ids-and-timestamps (dissoc task-history :duration))))

(deftest task-history-test
  (let [process-name (mt/random-name)
        step-1-name  (mt/random-name)
        step-2-name  (mt/random-name)
        sync-steps   [(sync-util/create-sync-step step-1-name (fn [_] (Thread/sleep 10) {:foo "bar"}))
                      (sync-util/create-sync-step step-2-name (fn [_] (Thread/sleep 10)))]
        mock-db      (mi/instance Database {:name "test", :id 1, :engine :h2})
        [results]    (:operation-results
                      (call-with-operation-info! #(sync-util/run-sync-operation process-name mock-db sync-steps)))]
    (testing "valid operation metadata?"
      (is (= true
             (validate-times results))))
    (testing "valid step metadata?"
      (is (= [true true]
             (map (comp validate-times second) (:steps results)))))
    (testing "step names"
      (is (= [step-1-name step-2-name]
             (map first (:steps results)))))
    (testing "operation history"
      (is (= (merge default-task-history {:task process-name, :task_details nil})
             (fetch-task-history-row process-name))))
    (testing "step 1 history"
      (is (= (merge default-task-history {:task step-1-name, :task_details {:foo "bar"}})
             (fetch-task-history-row step-1-name))))
    (testing "step 2 history"
      (is (= (merge default-task-history {:task step-2-name, :task_details nil})
             (fetch-task-history-row step-2-name))))))

(deftest run-sync-operation-record-failed-task-history-test
  (let [process-name (mt/random-name)
        step-name-1  (mt/random-name)
        step-name-2  (mt/random-name)
        mock-db      (mi/instance Database {:name "test", :id 1, :engine :h2})
        sync-steps   [(sync-util/create-sync-step step-name-1
                                                  (fn [_]
                                                    (throw (ex-info "Sorry" {}))))
                      (sync-util/create-sync-step step-name-2
                                                  (fn [_]
                                                    (sync-util/with-error-handling "fail"
                                                      (throw (ex-info "Sorry" {})))))]]
    (call-with-operation-info! #(sync-util/run-sync-operation process-name mock-db sync-steps))
    (testing "operation history"
      (is (= (merge default-task-history {:task process-name, :task_details nil})
             (fetch-task-history-row process-name))))
    (testing "step history should has status is failed"
      (is (=? (merge default-task-history
                     {:task step-name-1
                      :task_details {:exception (mt/malli=? :string)
                                     :stacktrace (mt/malli=? [:sequential :string])}
                      :status :failed})
              (fetch-task-history-row step-name-1)))
      (is (=? (merge default-task-history
                     {:task step-name-2
                      :task_details {:exception (mt/malli=? :string)
                                     :stacktrace (mt/malli=? [:sequential :string])}
                      :status :failed})
              (fetch-task-history-row step-name-2))))))

(defn- create-test-sync-summary [step-name log-summary-fn]
  (let [start (t/zoned-date-time)]
    {:start-time start
     :end-time   (t/plus start (t/seconds 5))
     :steps      [[step-name {:start-time     start
                              :end-time       (t/plus start (t/seconds 4))
                              :log-summary-fn log-summary-fn}]]}))

(deftest log-summary-message-test
  (let [operation (mt/random-name)
        db-name   (mt/random-name)
        step-name (mt/random-name)]
    (testing (str "Test that we can create the log summary message. This is a big string blob, so validate that it"
                  " contains the important parts and it doesn't throw an exception")
      (let [step-log-text (mt/random-name)
            results       (#'sync-util/make-log-sync-summary-str operation
                                                                 (mi/instance Database {:name db-name})
                                                                 (create-test-sync-summary step-name
                                                                                           (constantly step-log-text)))]
        (testing "has-operation?"
          (is (= true
                 (str/includes? results operation))))
        (testing "has-db-name?"
          (is (= true
                 (str/includes? results db-name))))
        (testing "has-operation-duration?"
          (is (= true
                 (str/includes? results "5.0 s"))))
        (testing "has-step-name?"
          (is (= true
                 (str/includes? results step-name))))
        (testing "has-step-duration?"
          (is (= true
                 (str/includes? results "4.0 s"))))
        (testing "has-log-summary-text?"
          (is (= true
                 (str/includes? results step-log-text))))))
    (testing (str "The `log-summary-fn` part of step info is optional as not all steps have it. Validate that we"
                  " properly handle that case")
      (let [results (#'sync-util/make-log-sync-summary-str operation
                                                           (mi/instance Database {:name db-name})
                                                           (create-test-sync-summary step-name nil))]
        (testing "has-operation?"
          (is (= true
                 (str/includes? results operation))))
        (testing "has-db-name?"
          (is (= true
                 (str/includes? results db-name))))
        (testing "has-operation-duration?"
          (is (= true
                 (str/includes? results "5.0 s"))))
        (testing "has-step-name?"
          (is (= true
                 (str/includes? results step-name))))
        (testing "has-step-duration?"
          (is (= true
                 (str/includes? results "4.0 s"))))))))

(derive ::sync-error-handling-begin ::sync-util/event)
(derive ::sync-error-handling-end ::sync-util/event)

(deftest ^:parallel error-handling-test
  (testing "A ConnectException will cause sync to stop"
    (mt/dataset time-test-data
      (let [expected           (java.io.IOException.
                                "outer"
                                (java.net.ConnectException.
                                 "inner, this one triggers the failure"))
            actual             (sync-util/sync-operation ::sync-error-handling (mt/db) "sync error handling test"
                                 (sync-util/run-sync-operation
                                  "sync"
                                  (mt/db)
                                  [(sync-util/create-sync-step "failure-step"
                                                               (fn [_]
                                                                 (throw expected)))
                                   (sync-util/create-sync-step "should-not-run"
                                                               (fn [_]
                                                                 {}))]))
            [step-name result] (first (:steps actual))]
        (is (= 1 (count (:steps actual))))
        (is (= "failure-step" step-name))
        (is (= {:throwable expected :log-summary-fn nil}
               (dissoc result :start-time :end-time)))))))

(deftest ^:parallel error-handling-test-2
  (doseq [ex [(java.io.IOException.
               "outer, does not trigger"
               (java.net.SocketException. "inner, this one does not trigger"))
              (java.lang.IllegalArgumentException. "standalone, does not trigger")
              (java.sql.SQLException.
               "outer, does not trigger"
               (java.sql.SQLException.
                "inner, does not trigger"
                (java.lang.IllegalArgumentException.
                 "third level, does not trigger")))]]
    (testing "Other errors will not cause sync to stop"
      (let [actual             (sync-util/sync-operation ::sync-error-handling (mt/db) "sync error handling test"
                                 (sync-util/run-sync-operation
                                  "sync"
                                  (mt/db)
                                  [(sync-util/create-sync-step "failure-step"
                                                               (fn [_]
                                                                 (throw ex)))
                                   (sync-util/create-sync-step "should-continue"
                                                               (fn [_]
                                                                 {}))]))]

        ;; make sure we've ran two steps. the first one will have thrown an exception,
        ;; but it wasn't an exception that can cause an abort.
        (is (= 2 (count (:steps actual))))
        (let [[step-name result] (first (:steps actual))]
          (is (= "failure-step" step-name))
          (is (= {:throwable ex :log-summary-fn nil}
                 (dissoc result :start-time :end-time))))
        (let [[step-name result] (second (:steps actual))]
          (is (= "should-continue" step-name))
          (is (= {:log-summary-fn nil} (dissoc result :start-time :end-time))))))))

(deftest initial-sync-status-test
  (mt/dataset test-data
    (testing "If `initial-sync-status` on a DB is `incomplete`, it is marked as `complete` when sync-metadata has finished"
      (let [_  (t2/update! Database (:id (mt/db)) {:initial_sync_status "incomplete"})
            db (t2/select-one Database :id (:id (mt/db)))]
        (sync/sync-database! db)
        (is (= "complete" (t2/select-one-fn :initial_sync_status Database :id (:id db))))))

    (testing "If `initial-sync-status` on a DB is `complete`, it remains `complete` when sync is run again"
      (let [_  (t2/update! Database (:id (mt/db)) {:initial_sync_status "complete"})
            db (t2/select-one Database :id (:id (mt/db)))]
        (sync/sync-database! db)
        (is (= "complete" (t2/select-one-fn :initial_sync_status Database :id (:id db))))))

    (testing "If `initial-sync-status` on a table is `incomplete`, it is marked as `complete` after the sync-fks step
                       has finished"
      (let [table-id (t2/select-one-fn :id Table :db_id (:id (mt/db)))
            _        (t2/update! Table table-id {:initial_sync_status "incomplete"})
            _table   (t2/select-one Table :id table-id)]
        (sync/sync-database! (mt/db))
        (is (= "complete" (t2/select-one-fn :initial_sync_status Table :id table-id)))))

    (testing "Database and table syncs are marked as complete even if the initial scan is :schema only"
      (let [_        (t2/update! Database (:id (mt/db)) {:initial_sync_status "incomplete"})
            db       (t2/select-one Database :id (:id (mt/db)))
            table-id (t2/select-one-fn :id Table :db_id (:id (mt/db)))
            _        (t2/update! Table table-id {:initial_sync_status "incomplete"})
            _table   (t2/select-one Table :id table-id)]
        (sync/sync-database! db {:scan :schema})
        (is (= "complete" (t2/select-one-fn :initial_sync_status Database :id (:id db))))
        (is (= "complete" (t2/select-one-fn :initial_sync_status Table :id table-id)))))

    (testing "If a non-recoverable error occurs during sync, `initial-sync-status` on the database is set to `aborted`"
      (let [_  (t2/update! Database (:id (mt/db)) {:initial_sync_status "incomplete"})
            db (t2/select-one Database :id (:id (mt/db)))]
        (with-redefs [sync-metadata/make-sync-steps (fn [_]
                                                      [(sync-util/create-sync-step
                                                         "fake-step"
                                                         (fn [_] (throw (java.net.ConnectException.))))])]
          (sync/sync-database! db)
          (is (= "aborted" (t2/select-one-fn :initial_sync_status Database :id (:id db)))))))

    (testing "If `initial-sync-status` is `aborted` for a database, it is set to `complete` the next time sync finishes
                       without error"
      (let [_  (t2/update! Database (:id (mt/db)) {:initial_sync_status "complete"})
            db (t2/select-one Database :id (:id (mt/db)))]
        (sync/sync-database! db)
        (is (= "complete" (t2/select-one-fn :initial_sync_status Database :id (:id db))))))))

(deftest initial-sync-status-table-only-test
  ;; Test that if a database is already completed sync'ing, then the sync is started again, it should initially be marked as
  ;; incomplete, but then marked as complete after the sync is finished.
  (mt/dataset test-data
    (testing "If `initial-sync-status` on a DB is already `complete`"
      (let [[active-table inactive-table] (t2/select Table :db_id (mt/id))
            get-active-table #(t2/select-one Table :id (:id active-table))
            get-inactive-table #(t2/select-one Table :id (:id inactive-table))]
        (t2/update! Table (:id active-table) {:initial_sync_status "complete" :active true})
        (t2/update! Table (:id inactive-table) {:initial_sync_status "complete" :active false})
        (let [syncing-chan   (a/chan)
              completed-chan (a/chan)]
          (let [sync-fields! sync-fields/sync-fields!]
            (with-redefs [sync-fields/sync-fields! (fn [database]
                                                     (a/>!! syncing-chan ::syncing)
                                                     (sync-fields! database))]
              (future
                (sync/sync-database! (mt/db))
                (a/>!! completed-chan ::sync-completed))
              (a/<!! syncing-chan)
              (testing "for existing tables initial_sync_status is complete while sync is running"
                (is (= "complete"   (:initial_sync_status (get-active-table)))))
              (testing "for new or previously inactive tables, initial_sync_status is incomplete while sync is running"
                (is (= "incomplete" (:initial_sync_status (get-inactive-table)))))
              (a/<!! completed-chan)
              (testing "initial_sync_status is complete after the sync is finished"
                (is (= "complete"   (:initial_sync_status (get-active-table))))
                (is (= "complete"   (:initial_sync_status (get-inactive-table)))))))
          (a/close! syncing-chan)
          (a/close! completed-chan))))))
