(ns metabase.sync.util-test
  "Tests for the utility functions shared by all parts of sync, such as the duplicate ops guard."
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [expectations :refer [expect]]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [sync :as sync]]
            [metabase.models
             [database :as mdb :refer [Database]]
             [task-history :refer [TaskHistory]]]
            [metabase.sync.util :as sync-util :refer :all]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

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

(deftest concurrent-sync-test
  (testing "only one sync process be going on at a time"
    ;; describe-database gets called twice during a single sync process, once for syncing tables and a second time for
    ;; syncing the _metabase_metadata table
    (tt/with-temp* [Database [db {:engine ::concurrent-sync-test}]]
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
        ;; Check the number of syncs that took place. Should be 2 (just the first)
        (is (= 2
               @calls-to-describe-database))))))

(defn- call-with-operation-info
  "Call `f` with `log-sync-summary` and `store-sync-summary!` redef'd. For `log-sync-summary`, it intercepts the step
  metadata before the information is logged. For `store-sync-summary!` it will return the IDs for the newly created
  TaskHistory rows. This is useful to validate that the metadata and history is correct as the message might not be
  logged at all (depending on the logging level) or not stored."
  [f]
  (let [step-info-atom           (atom [])
        created-task-history-ids (atom [])
        orig-log-fn              @#'metabase.sync.util/log-sync-summary
        orig-store-fn            @#'metabase.sync.util/store-sync-summary!]
    (with-redefs [metabase.sync.util/log-sync-summary    (fn [operation database {:keys [steps] :as operation-metadata}]
                                                           (swap! step-info-atom conj operation-metadata)
                                                           (orig-log-fn operation database operation-metadata))
                  metabase.sync.util/store-sync-summary! (fn [operation database operation-metadata]
                                                           (let [result (orig-store-fn operation database operation-metadata)]
                                                             (swap! created-task-history-ids concat result)
                                                             result))]
      (f))
    {:operation-results @step-info-atom
     :task-history-ids  @created-task-history-ids}))

(defn sync-database!
  "Calls `sync-database!` and returns the the metadata for `step` as the result along with the `TaskHistory` for that
  `step`. This function is useful for validating that each step's metadata correctly reflects the changes that were
  made via a test scenario."
  [step db]
  (let [{:keys [operation-results task-history-ids]} (call-with-operation-info #(sync/sync-database! db))]
    {:step-info    (-> (into {} (mapcat :steps operation-results))
                       (get step))
     :task-history (when (seq task-history-ids)
                     (db/select-one TaskHistory :id [:in task-history-ids]
                                    :task [:= step]))}))

(defn only-step-keys
  "This function removes the generic keys for the step metadata, returning only the step specific keypairs to make
  validating the results for the given step easier."
  [step-info]
  (dissoc step-info :start-time :end-time :log-summary-fn))

(defn- validate-times [{:keys [start-time end-time]}]
  (every? (partial instance? java.time.temporal.Temporal) [start-time end-time]))

(def ^:private default-task-history
  {:id true, :db_id true, :started_at true, :ended_at true})

(defn- fetch-task-history-row [task-name]
  (let [task-history (db/select-one TaskHistory :task task-name)]
    (assert (integer? (:duration task-history)))
    (tu/boolean-ids-and-timestamps (dissoc task-history :duration))))

(let [process-name (tu/random-name)
      step-1-name  (tu/random-name)
      step-2-name  (tu/random-name)]
  (expect
    {:valid-operation-metadata? true
     :valid-step-metadata?      [true true]
     :step-names                [step-1-name step-2-name]
     :operation-history         (merge default-task-history
                                       {:task process-name, :task_details nil})
     :step-1-history            (merge default-task-history
                                       {:task step-1-name, :task_details {:foo "bar"}})
     :step-2-history            (merge default-task-history
                                       {:task step-2-name, :task_details nil})}
    (let [sync-steps [(create-sync-step step-1-name (fn [_] (Thread/sleep 10) {:foo "bar"}))
                      (create-sync-step step-2-name (fn [_] (Thread/sleep 10)))]
          mock-db    (mdb/map->DatabaseInstance {:name "test", :id 1, :engine :h2})
          [results]  (:operation-results
                      (call-with-operation-info #(run-sync-operation process-name mock-db sync-steps)))]

      {:valid-operation-metadata? (validate-times results)
       :valid-step-metadata?      (map (comp validate-times second) (:steps results))
       :step-names                (map first (:steps results))
       ;; Check that the TaskHistory was stored for the operation and each of the steps
       :operation-history         (fetch-task-history-row process-name)
       :step-1-history            (fetch-task-history-row step-1-name)
       :step-2-history            (fetch-task-history-row step-2-name)})))

(defn- create-test-sync-summary [step-name log-summary-fn]
  (let [start (t/zoned-date-time)]
    {:start-time start
     :end-time   (t/plus start (t/seconds 5))
     :steps      [[step-name {:start-time     start
                              :end-time       (t/plus start (t/seconds 4))
                              :log-summary-fn log-summary-fn}]]}))

(deftest log-summary-message-test
  (let [operation (tu/random-name)
        db-name   (tu/random-name)
        step-name (tu/random-name)]
    (testing (str "Test that we can create the log summary message. This is a big string blob, so validate that it"
                  " contains the important parts and it doesn't throw an exception")
      (let [step-log-text (tu/random-name)
            results       (#'sync-util/make-log-sync-summary-str operation
                                                                 (mdb/map->DatabaseInstance {:name db-name})
                                                                 (create-test-sync-summary step-name
                                                                                           (fn [step-info]
                                                                                             step-log-text)))]
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
                                                           (mdb/map->DatabaseInstance {:name db-name})
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
