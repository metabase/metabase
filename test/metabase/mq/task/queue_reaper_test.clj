(ns metabase.mq.task.queue-reaper-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.quartz-affinity :as quartz-affinity]
   [metabase.mq.task.queue-reaper :as queue-reaper]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (org.quartz Scheduler TriggerKey)))

(set! *warn-on-reflection* true)

;; This test reads/writes the QRTZ_* tables directly, so the app-db must be migrated.
(use-fixtures :once (fixtures/initialize :db))

(defn- insert-trigger!
  "Inserts a queue job + trigger row directly into the app-db QRTZ_* tables under `sched`."
  [sched jn state start]
  (let [jg quartz-affinity/queue-job-group]
    (t2/query (str "INSERT INTO QRTZ_JOB_DETAILS (sched_name,job_name,job_group,job_class_name,is_durable,is_nonconcurrent,is_update_data,requests_recovery)"
                   " VALUES ('" sched "','" jn "','" jg "','x.Job',true,false,false,false)"))
    (t2/query (str "INSERT INTO QRTZ_TRIGGERS (sched_name,trigger_name,trigger_group,job_name,job_group,next_fire_time,priority,trigger_state,trigger_type,start_time,misfire_instr)"
                   " VALUES ('" sched "','t-" jn "','" jg "','" jn "','" jg "'," start ",5,'" state "','SIMPLE'," start ",-1)"))))

(defn- cleanup-sched! [sched]
  (t2/query (str "DELETE FROM QRTZ_TRIGGERS WHERE sched_name='" sched "'"))
  (t2/query (str "DELETE FROM QRTZ_JOB_DETAILS WHERE sched_name='" sched "'")))

(deftest orphaned-trigger-rows-selects-only-stuck-queue-triggers-test
  (testing "orphaned-trigger-rows selects only queue-group WAITING triggers older than the threshold"
    (let [sched  (str "REAPER_TEST_" (random-uuid))
          now    (.toEpochMilli (Instant/now))
          old    (- now (* 2 24 60 60 1000))   ; 2 days ago
          recent (- now 60000)]                ; 1 min ago
      (try
        (insert-trigger! sched "stuck-old"    "WAITING"  old)      ; the only one that should be reaped
        (insert-trigger! sched "fresh"        "WAITING"  recent)   ; too recent
        (insert-trigger! sched "old-acquired" "ACQUIRED" old)      ; not WAITING (being delivered)
        ;; a non-queue trigger (e.g. sync) in a different group
        (t2/query (str "INSERT INTO QRTZ_JOB_DETAILS (sched_name,job_name,job_group,job_class_name,is_durable,is_nonconcurrent,is_update_data,requests_recovery)"
                       " VALUES ('" sched "','other-group','DEFAULT','x.Job',true,false,false,false)"))
        (t2/query (str "INSERT INTO QRTZ_TRIGGERS (sched_name,trigger_name,trigger_group,job_name,job_group,next_fire_time,priority,trigger_state,trigger_type,start_time,misfire_instr)"
                       " VALUES ('" sched "','t-other-group','DEFAULT','other-group','DEFAULT'," old ",5,'WAITING','SIMPLE'," old ",-1)"))
        (let [threshold (- now (* 24 60 60 1000)) ; 1 day
              rows      (#'queue-reaper/orphaned-trigger-rows sched threshold)]
          (is (= #{"stuck-old"} (set (map :job_name rows)))
              "only the old queue-group WAITING trigger is selected; fresh / acquired / non-queue are left alone"))
        (finally
          (cleanup-sched! sched))))))

(deftest drop-orphaned-triggers-unschedules-stuck-triggers-test
  (testing "each selected stuck trigger is unscheduled and counted"
    (let [sched       (str "REAPER_DROP_" (random-uuid))
          old         (- (.toEpochMilli (Instant/now)) (* 2 24 60 60 1000))
          unscheduled (atom [])
          scheduler   (reify Scheduler
                        (getSchedulerName [_] sched)
                        (unscheduleJob [_ tk] (swap! unscheduled conj (.getName ^TriggerKey tk)) true))]
      (try
        (insert-trigger! sched "stuck-a" "WAITING" old)
        (insert-trigger! sched "stuck-b" "WAITING" old)
        (insert-trigger! sched "fresh"   "WAITING" (- (.toEpochMilli (Instant/now)) 60000)) ; too recent to reap
        (is (= 2 (#'queue-reaper/drop-orphaned-triggers! scheduler))
            "both aged triggers are dropped; the fresh one is not")
        (is (= #{"t-stuck-a" "t-stuck-b"} (set @unscheduled)))
        (finally
          (cleanup-sched! sched))))))
