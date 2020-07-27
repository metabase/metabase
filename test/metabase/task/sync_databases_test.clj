(ns metabase.task.sync-databases-test
  "Tests for the logic behind scheduling the various sync operations of Databases. Most of the actual logic we're
  testing is part of `metabase.models.database`, so there's an argument to be made that these sorts of tests could
  just as easily belong to a `database-test` namespace."
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [expectations :refer [expect]]
            [metabase.models.database :refer [Database]]
            [metabase.task.sync-databases :as sync-db]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import [metabase.task.sync_databases SyncAndAnalyzeDatabase UpdateFieldValues]))

(deftest annotations-test
  (testing "make sure our annotations are present"
    (is (.isAnnotationPresent SyncAndAnalyzeDatabase org.quartz.DisallowConcurrentExecution))
    (is (.isAnnotationPresent UpdateFieldValues org.quartz.DisallowConcurrentExecution))))

(defn- replace-trailing-id-with-<id> [s]
  (some-> s (str/replace #"\d+$" "<id>")))

(defn- replace-ids-with-<id> [current-tasks]
  (vec (for [task current-tasks]
         (-> task
             (update :description replace-trailing-id-with-<id>)
             (update :key replace-trailing-id-with-<id>)
             (update :triggers (fn [triggers]
                                 (vec (for [trigger triggers]
                                        (-> trigger
                                            (update    :key  replace-trailing-id-with-<id>)
                                            (update-in [:data "db-id"] replace-trailing-id-with-<id>))))))))))

(defn- current-tasks-for-db [db-or-id]
  (replace-ids-with-<id>
   (for [job   (tu/scheduler-current-tasks)
         :when (#{"metabase.task.sync-and-analyze.job" "metabase.task.update-field-values.job"} (:key job))]
     (-> job
         (update :triggers (partial filter #(str/ends-with? (:key %) (str \. (u/get-id db-or-id)))))
         (dissoc :class)))))

(defmacro ^:private with-scheduler-setup [& body]
  `(tu/with-temp-scheduler
     (#'sync-db/job-init)
     ~@body))

(def ^:private sync-job
  {:description "sync-and-analyze for all databases"
   :key         "metabase.task.sync-and-analyze.job"
   :data        {}
   :triggers    [{:key           "metabase.task.sync-and-analyze.trigger.<id>"
                  :cron-schedule "0 50 * * * ? *"
                  :data          {"db-id" "<id>"}}]})

(def ^:private fv-job
  {:description "update-field-values for all databases"
   :key         "metabase.task.update-field-values.job"
   :data        {}
   :triggers    [{:key           "metabase.task.update-field-values.trigger.<id>"
                  :cron-schedule "0 50 0 * * ? *"
                  :data          {"db-id" "<id>"}}]})

;; Check that a newly created database automatically gets scheduled
(expect
  [sync-job fv-job]
  (with-scheduler-setup
    (tt/with-temp Database [database {:engine :postgres}]
      (current-tasks-for-db database))))


;; Check that a custom schedule is respected when creating a new Database
(expect
  [(assoc-in sync-job [:triggers 0 :cron-schedule] "0 30 4,16 * * ? *")
   (assoc-in fv-job   [:triggers 0 :cron-schedule] "0 15 10 ? * 6#3")]
  (with-scheduler-setup
    (tt/with-temp Database [database {:engine                      :postgres
                                      :metadata_sync_schedule      "0 30 4,16 * * ? *" ; 4:30 AM and PM daily
                                      :cache_field_values_schedule "0 15 10 ? * 6#3"}] ; 10:15 on the 3rd Friday of the Month
      (current-tasks-for-db database))))


;; Check that a deleted database gets unscheduled
(expect
  [(update sync-job :triggers empty)
   (update fv-job   :triggers empty)]
  (with-scheduler-setup
    (tt/with-temp Database [database {:engine :postgres}]
      (db/delete! Database :id (u/get-id database))
      (current-tasks-for-db database))))

;; Check that changing the schedule column(s) for a DB properly updates the scheduled tasks
(expect
  [(assoc-in sync-job [:triggers 0 :cron-schedule] "0 15 10 ? * MON-FRI")
   (assoc-in fv-job   [:triggers 0 :cron-schedule] "0 11 11 11 11 ?")]
  (with-scheduler-setup
    (tt/with-temp Database [database {:engine :postgres}]
      (db/update! Database (u/get-id database)
        :metadata_sync_schedule      "0 15 10 ? * MON-FRI" ; 10:15 AM every weekday
        :cache_field_values_schedule "0 11 11 11 11 ?")    ; Every November 11th at 11:11 AM
      (current-tasks-for-db database))))

;; Check that changing one schedule doesn't affect the other
(expect
  [sync-job
   (assoc-in fv-job [:triggers 0 :cron-schedule] "0 15 10 ? * MON-FRI")]
  (with-scheduler-setup
    (tt/with-temp Database [database {:engine :postgres}]
      (db/update! Database (u/get-id database)
        :cache_field_values_schedule "0 15 10 ? * MON-FRI")
      (current-tasks-for-db database))))

(expect
  [(assoc-in sync-job [:triggers 0 :cron-schedule] "0 15 10 ? * MON-FRI")
   fv-job]
  (with-scheduler-setup
    (tt/with-temp Database [database {:engine :postgres}]
      (db/update! Database (u/get-id database)
        :metadata_sync_schedule "0 15 10 ? * MON-FRI")
      (current-tasks-for-db database))))

(deftest validate-schedules-test
  (testing "Check that you can't INSERT a DB with an invalid schedule"
    (doseq [k [:metadata_sync_schedule :cache_field_values_schedule]]
      (testing (format "Insert DB with invalid %s" k)
        (is (thrown?
             Exception
             (db/insert! Database {:engine :postgres, k "0 * ABCD"}))))))

  (testing "Check that you can't UPDATE a DB's schedule to something invalid"
    (tt/with-temp Database [database {:engine :postgres}]
      (doseq [k [:metadata_sync_schedule :cache_field_values_schedule]]
        (testing (format "Update %s" k)
          (is (thrown?
               Exception
               (db/update! Database (u/get-id database)
                 k "2 CANS PER DAY"))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    CHECKING THAT SYNC TASKS RUN CORRECT FNS                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - it would be nice if we could rework this test so we didn't have to wait for so long to see if things
;; happened or not
(defn- check-if-sync-processes-ran-for-db {:style/indent 0} [db-info]
  (let [sync-db-metadata-ran?    (promise)
        analyze-db-ran?          (promise)
        update-field-values-ran? (promise)]
    (with-redefs [metabase.sync.sync-metadata/sync-db-metadata!   (fn [& _] (deliver sync-db-metadata-ran? true))
                  metabase.sync.analyze/analyze-db!               (fn [& _] (deliver analyze-db-ran? true))
                  metabase.sync.field-values/update-field-values! (fn [& _] (deliver update-field-values-ran? true))]
      (with-scheduler-setup
        (tt/with-temp Database [database db-info]
          {:ran-sync?                (deref sync-db-metadata-ran?    1000 false)
           :ran-analyze?             (deref analyze-db-ran?           200 false)
           :ran-update-field-values? (deref update-field-values-ran?  500 false)})))))

(defn- cron-schedule-for-next-year []
  (format "0 15 10 * * ? %d" (inc (u.date/extract :year))))

(deftest check-sync-tasks-run-test
  (testing "Make sure that a database that *is* marked full sync *will* get analyzed"
    (is (=  {:ran-sync? true, :ran-analyze? true, :ran-update-field-values? false}
            (check-if-sync-processes-ran-for-db
              {:engine                      :postgres
               :metadata_sync_schedule      "* * * * * ? *"
               :cache_field_values_schedule (cron-schedule-for-next-year)}))))

  (testing "Make sure that a database that *isn't* marked full sync won't get analyzed"
    (is (= {:ran-sync? true, :ran-analyze? false, :ran-update-field-values? false}
           (check-if-sync-processes-ran-for-db
             {:engine                      :postgres
              :is_full_sync                false
              :metadata_sync_schedule      "* * * * * ? *"
              :cache_field_values_schedule (cron-schedule-for-next-year)}))))

  (testing "Make sure the update field values task calls `update-field-values!`"
    (is (= {:ran-sync? false, :ran-analyze? false, :ran-update-field-values? true}
           (check-if-sync-processes-ran-for-db
             {:engine                      :postgres
              :is_full_sync                true
              :metadata_sync_schedule      (cron-schedule-for-next-year)
              :cache_field_values_schedule "* * * * * ? *"}))))

  (testing "...but if DB is not \"full sync\" it should not get updated FieldValues"
    (is (= {:ran-sync? false, :ran-analyze? false, :ran-update-field-values? false}
           (check-if-sync-processes-ran-for-db
             {:engine                      :postgres
              :is_full_sync                false
              :metadata_sync_schedule      (cron-schedule-for-next-year)
              :cache_field_values_schedule "* * * * * ? *"})))))
