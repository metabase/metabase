(ns metabase.task.sync-databases-test
  "Tests for the logic behind scheduling the various sync operations of Databases. Most of the actual logic we're
  testing is part of [[metabase.models.database]], so there's an argument to be made that these sorts of tests could
  just as easily belong to a `database-test` namespace."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.conversion :as qc]
   [java-time.api :as t]
   [metabase.models.database :refer [Database]]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.task :as task]
   [metabase.task.sync-databases :as task.sync-databases]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (metabase.task.sync_databases SyncAndAnalyzeDatabase UpdateFieldValues)
   (org.quartz TriggerKey)))

(set! *warn-on-reflection* true)

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

(defn all-db-sync-triggers-name
  "Returns the name of trigger for DB.
  These are all the trigger names that a database SHOULD have."
  [db]
  (set (map #(.getName ^TriggerKey (#'task.sync-databases/trigger-key (t2/instance :model/Database db) %))
            @#'task.sync-databases/all-tasks)))

(defn query-all-db-sync-triggers-name
  "Find the all triggers for DB \"db\".
  These are all the trigger names that a database HAS in the scheduler."
  [db]
  (let [db (t2/instance :model/Database db)]
    (assert (some? (#'task/scheduler)) "makes sure the scheduler is initialized!")
    (->> (for [task-info @#'task.sync-databases/all-tasks]
           (keep #(when (= (.getName ^TriggerKey (#'task.sync-databases/trigger-key db task-info)) (:key %))
                    (:key %))
                 (:triggers (task/job-info (#'task.sync-databases/job-key task-info)))))
         flatten
         set)))

(defn- current-tasks-for-db [db-or-id]
  (replace-ids-with-<id>
   (for [job   (tu/scheduler-current-tasks)
         :when (#{"metabase.task.sync-and-analyze.job" "metabase.task.update-field-values.job"} (:key job))]
     (-> job
         (update :triggers (partial filter #(str/ends-with? (:key %) (str \. (u/the-id db-or-id)))))
         (dissoc :class)))))

(defmacro with-scheduler-setup [& body]
  `(tu/with-temp-scheduler
     (#'task.sync-databases/job-init)
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
(deftest new-db-jobs-scheduled-test
  (is (= [sync-job fv-job]
         (with-scheduler-setup
           (t2.with-temp/with-temp [Database database {:details {:let-user-control-scheduling true}}]
             (current-tasks-for-db database))))))

;; Check that a custom schedule is respected when creating a new Database
(deftest custom-schedule-test
  (is (= [(assoc-in sync-job [:triggers 0 :cron-schedule] "0 30 4,16 * * ? *")
          (assoc-in fv-job   [:triggers 0 :cron-schedule] "0 15 10 ? * 6#3")]
         (with-scheduler-setup
           (t2.with-temp/with-temp [Database database {:details                     {:let-user-control-scheduling true}
                                                       :metadata_sync_schedule      "0 30 4,16 * * ? *" ; 4:30 AM and PM daily
                                                       :cache_field_values_schedule "0 15 10 ? * 6#3"}] ; 10:15 on the 3rd Friday of the Month
             (current-tasks-for-db database))))))

;; Check that a deleted database gets unscheduled
(deftest unschedule-deleted-database-test
  (is (= [(update sync-job :triggers empty)
          (update fv-job   :triggers empty)]
         (with-scheduler-setup
           (t2.with-temp/with-temp [Database database {:details {:let-user-control-scheduling true}}]
             (t2/delete! Database :id (u/the-id database))
             (current-tasks-for-db database))))))

;; Check that changing the schedule column(s) for a DB properly updates the scheduled tasks
(deftest schedule-change-test
  (is (= [(assoc-in sync-job [:triggers 0 :cron-schedule] "0 15 10 ? * MON-FRI")
          (assoc-in fv-job   [:triggers 0 :cron-schedule] "0 11 11 11 11 ?")]
         (with-scheduler-setup
           (t2.with-temp/with-temp [Database database {:details {:let-user-control-scheduling true}}]
             (t2/update! Database (u/the-id database)
                         {:metadata_sync_schedule      "0 15 10 ? * MON-FRI" ; 10:15 AM every weekday
                          :cache_field_values_schedule "0 11 11 11 11 ?"})   ; Every November 11th at 11:11 AM
             (current-tasks-for-db database))))))

;; Check that changing one schedule doesn't affect the other
(deftest schedule-changes-only-expected-test
  (is (= [sync-job
          (assoc-in fv-job [:triggers 0 :cron-schedule] "0 15 10 ? * MON-FRI")]
         (with-scheduler-setup
           (t2.with-temp/with-temp [Database database {:details {:let-user-control-scheduling true}}]
             (t2/update! Database (u/the-id database)
                         {:cache_field_values_schedule "0 15 10 ? * MON-FRI"})
             (current-tasks-for-db database)))))

  (is (= [(assoc-in sync-job [:triggers 0 :cron-schedule] "0 15 10 ? * MON-FRI")
          fv-job]
         (with-scheduler-setup
           (t2.with-temp/with-temp [Database database {:details {:let-user-control-scheduling true}}]
             (t2/update! Database (u/the-id database)
                         {:metadata_sync_schedule "0 15 10 ? * MON-FRI"})
             (current-tasks-for-db database))))))

(deftest validate-schedules-test
  (testing "Check that you can't INSERT a DB with an invalid schedule"
    (doseq [k [:metadata_sync_schedule :cache_field_values_schedule]]
      (testing (format "Insert DB with invalid %s" k)
        (is (thrown?
             Exception
             (t2/insert! Database {:engine :postgres, k "0 * ABCD"}))))))

  (testing "Check that you can't UPDATE a DB's schedule to something invalid"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [Database database {:details {:let-user-control-scheduling true}}]
        (doseq [k [:metadata_sync_schedule :cache_field_values_schedule]]
          (testing (format "Update %s" k)
            (is (thrown?
                 Exception
                 (t2/update! Database (u/the-id database)
                             {k "2 CANS PER DAY"})))))))))

;; this is a deftype due to an issue with Clojure. The `org.quartz.JobExecutionContext` interface has a put method and
;; defrecord emits a put method and things get
;; funky. https://ask.clojure.org/index.php/9943/defrecord-can-emit-invalid-bytecode
;; https://www.quartz-scheduler.org/api/2.1.7/org/quartz/JobExecutionContext.html#put(java.lang.Object,%20java.lang.Object)
(deftype MockJobExecutionContext [job-data-map]
  org.quartz.JobExecutionContext
  (getMergedJobDataMap [_this] (org.quartz.JobDataMap. job-data-map))

  qc/JobDataMapConversion
  (from-job-data [this]
    (.getMergedJobDataMap this)))

(deftest check-orphaned-jobs-removed-test
  (testing "jobs for orphaned databases are removed during sync run"
    (with-scheduler-setup
      (doseq [sync-fn [#'task.sync-databases/update-field-values! #'task.sync-databases/sync-and-analyze-database!]]
        (testing (str sync-fn)
          (t2.with-temp/with-temp [Database database {:details {:let-user-control-scheduling true}}]
            (let [db-id (:id database)]
              (is (= [sync-job fv-job]
                     (current-tasks-for-db database)))

              (t2/delete! Database :id db-id)
              (let [ctx (MockJobExecutionContext. {"db-id" db-id})]
                (sync-fn ctx))

              (is (= [(update sync-job :triggers empty)
                      (update fv-job :triggers empty)]
                     (current-tasks-for-db database))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    CHECKING THAT SYNC TASKS RUN CORRECT FNS                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

#_(defn- check-if-sync-processes-ran-for-db {:style/indent 0} [waits db-info]
    (let [sync-db-metadata-ran?    (promise)
          analyze-db-ran?          (promise)
          update-field-values-ran? (promise)]
      (with-redefs [metabase.sync.sync-metadata/sync-db-metadata!   (fn [& _] (deliver sync-db-metadata-ran? true))
                    metabase.sync.analyze/analyze-db!               (fn [& _] (deliver analyze-db-ran? true))
                    metabase.sync.field-values/update-field-values! (fn [& _] (deliver update-field-values-ran? true))]
        (with-scheduler-setup
          (t2.with-temp/with-temp [Database database db-info]
            ;; deref the promises in parallel so they all get sufficient time to run.
            (into {} (pmap (fn [[k promis]]
                             (let [wait-time-ms (or (get waits k)
                                                    (throw (ex-info (str "Don't know how long to wait for " k) {})))]
                               [k (deref promis wait-time-ms false)]))
                           {:ran-sync?                sync-db-metadata-ran?
                            :ran-analyze?             analyze-db-ran?
                            :ran-update-field-values? update-field-values-ran?})))))))

#_(defn- cron-schedule-for-next-year []
   (format "0 15 10 * * ? %d" (inc (u.date/extract :year))))

;; this test fails all the time -- disabled for now until I figure out how to fix it - Cam
#_(deftest check-sync-tasks-run-test
    (testing "Make sure that a database that *is* marked full sync *will* get analyzed"
      (is (=  {:ran-sync? true, :ran-analyze? true, :ran-update-field-values? false}
              (check-if-sync-processes-ran-for-db
               {:ran-sync? 3000, :ran-analyze? 3000, :ran-update-field-values? 500}
               {:engine                      :postgres
                :metadata_sync_schedule      "* * * * * ? *"
                :cache_field_values_schedule (cron-schedule-for-next-year)}))))

    (testing "Make sure that a database that *isn't* marked full sync won't get analyzed"
      (is (= {:ran-sync? true, :ran-analyze? false, :ran-update-field-values? false}
             (check-if-sync-processes-ran-for-db
              {:ran-sync? 3000, :ran-analyze? 500, :ran-update-field-values? 500}
              {:engine                      :postgres
               :is_full_sync                false
               :metadata_sync_schedule      "* * * * * ? *"
               :cache_field_values_schedule (cron-schedule-for-next-year)}))))

    (testing "Make sure the update field values task calls `update-field-values!`"
      (is (= {:ran-sync? false, :ran-analyze? false, :ran-update-field-values? true}
             (check-if-sync-processes-ran-for-db
              {:ran-sync? 500, :ran-analyze? 500, :ran-update-field-values? 3000}
              {:engine                      :postgres
               :is_full_sync                true
               :metadata_sync_schedule      (cron-schedule-for-next-year)
               :cache_field_values_schedule "* * * * * ? *"}))))

    (testing "...but if DB is not \"full sync\" it should not get updated FieldValues"
      (is (= {:ran-sync? false, :ran-analyze? false, :ran-update-field-values? false}
             (check-if-sync-processes-ran-for-db
              {:ran-sync? 500, :ran-analyze? 500, :ran-update-field-values? 500}
              {:engine                      :postgres
               :is_full_sync                false
               :metadata_sync_schedule      (cron-schedule-for-next-year)
               :cache_field_values_schedule "* * * * * ? *"})))))

(def should-refingerprint #'task.sync-databases/should-refingerprint-fields?)
(def threshold @#'task.sync-databases/analyze-duration-threshold-for-refingerprinting)

(defn results [minutes-duration fingerprints-attempted]
  (let [now (t/instant)
        end (t/plus now (t/minutes minutes-duration))]
    {:start-time now
     :end-time end
     :steps
     [["fingerprint-fields"
       {:no-data-fingerprints 0,
        :failed-fingerprints 0,
        :updated-fingerprints fingerprints-attempted,
        :fingerprints-attempted fingerprints-attempted,
        :start-time #t "2020-11-03T18:02:10.826813Z[UTC]",
        :end-time #t "2020-11-03T18:02:10.864099Z[UTC]"}]]
     :name "analyze"}))

(deftest should-refingeprint-fields?-test
  (testing "If it took too long it doesn't fingerprint"
    (is (not (should-refingerprint (results (inc threshold) 1)))))
  (testing "If it fingerprinted other fields it doesn't fingerprint"
    (is (not (should-refingerprint (results (dec threshold) 10)))))
  (testing "It will fingerprint if under time and no other fingerprints"
    (is (should-refingerprint (results (dec threshold) 0)))))

(deftest randomizing-schedules-test
  (testing "metabase-controls-schedule?"
    (is (not (#'task.sync-databases/metabase-controls-schedule?
              {:details {:let-user-control-scheduling true}})))
    (is (#'task.sync-databases/metabase-controls-schedule?
         {:details {:let-user-control-scheduling false}}))
    (is (#'task.sync-databases/metabase-controls-schedule?
         {:details {}}))))

(deftest randomize-db-schedules-if-needed-test
  (let [sync-default (first sync.schedules/default-metadata-sync-schedule-cron-strings)
        fv-default   (first sync.schedules/default-cache-field-values-schedule-cron-strings)]
    (testing "Randomizes databases that have the 'old' style schedule defaults"
      (mt/with-temp [Database db {:metadata_sync_schedule      sync-default
                                  :cache_field_values_schedule fv-default}]
        (#'task.sync-databases/randomize-db-schedules-if-needed)
        (let [after (t2/select-one Database :id (u/the-id db))]
          (is (not= sync-default (:metadata_sync_schedule after))
              "Sync schedule not randomized")
          (is (not= fv-default (:cache_field_values_schedule after))
              "Field values schedule not randomized"))))
    (testing "Does not randomize databases that have an already randomized sched"
      (let [custom-sync "0 58 * * * ? *",
            custom-fv   "0 0 16 * * ? *"]
        (mt/with-temp [Database db {:metadata_sync_schedule      custom-sync
                                    :cache_field_values_schedule custom-fv
                                    :details                     {:let-user-control-scheduling true}}]
          (#'task.sync-databases/randomize-db-schedules-if-needed)
          (let [after (t2/select-one Database :id (u/the-id db))]
            (is (= custom-sync (:metadata_sync_schedule after))
                "Sync schedule was erroneously randomized")
            (is (= custom-fv (:cache_field_values_schedule after))
                "Field values schedule was erroneously randomized")
            (is (= (:updated_at after) (:updated_at db)))))))
    (testing "Does not randomize databases that have default schedules but let users control schedule"
      (mt/with-temp [Database db {:metadata_sync_schedule      sync-default
                                  :cache_field_values_schedule fv-default
                                  :details                     {:let-user-control-scheduling true}}]
        (t2/update! Database (u/the-id db) {:details (assoc (:details db)
                                                            :let-user-control-scheduling true)})
        (let [before (t2/select-one Database :id (u/the-id db))]
          (#'task.sync-databases/randomize-db-schedules-if-needed)
          (let [after (t2/select-one Database :id (u/the-id db))]
            (is (= sync-default (:metadata_sync_schedule after))
                "Sync schedule erroneously randomized")
            (is (= fv-default (:cache_field_values_schedule after))
                "Field values schedule erroneously randomized")
            (is (= (:updated_at after) (:updated_at before)))))))))
