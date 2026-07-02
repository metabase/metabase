(ns metabase.mq.task.queue-reaper-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.quartz-affinity :as quartz-affinity]
   [metabase.mq.task.queue-reaper :as queue-reaper]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

;; This test reads/writes the QRTZ_* tables directly, so the app-db must be migrated.
(use-fixtures :once (fixtures/initialize :db))

(deftest orphaned-trigger-rows-selects-only-stuck-queue-triggers-test
  (testing "orphaned-trigger-rows selects only queue-group WAITING triggers older than the threshold"
    (let [sched   (str "REAPER_TEST_" (random-uuid))
          mqg     quartz-affinity/queue-job-group
          now     (.toEpochMilli (Instant/now))
          old     (- now (* 2 24 60 60 1000))   ; 2 days ago
          recent  (- now 60000)                 ; 1 min ago
          insert! (fn [jn jg state start]
                    (t2/query (str "INSERT INTO qrtz_job_details (sched_name,job_name,job_group,job_class_name,is_durable,is_nonconcurrent,is_update_data,requests_recovery)"
                                   " VALUES ('" sched "','" jn "','" jg "','x.Job',true,false,false,false)"))
                    (t2/query (str "INSERT INTO qrtz_triggers (sched_name,trigger_name,trigger_group,job_name,job_group,next_fire_time,priority,trigger_state,trigger_type,start_time,misfire_instr)"
                                   " VALUES ('" sched "','t-" jn "','" jg "','" jn "','" jg "'," start ",5,'" state "','SIMPLE'," start ",-1)")))]
      (try
        (insert! "stuck-old"    mqg       "WAITING"  old)      ; the only one that should be reaped
        (insert! "fresh"        mqg       "WAITING"  recent)   ; too recent
        (insert! "old-acquired" mqg       "ACQUIRED" old)      ; not WAITING (being delivered)
        (insert! "other-group"  "DEFAULT" "WAITING"  old)      ; not a queue trigger (e.g. sync)
        (let [threshold (- now (* 24 60 60 1000)) ; 1 day
              rows      (#'queue-reaper/orphaned-trigger-rows sched threshold)]
          (is (= #{"stuck-old"} (set (map :job_name rows)))
              "only the old queue-group WAITING trigger is selected; fresh / acquired / non-queue are left alone"))
        (finally
          (t2/query (str "DELETE FROM qrtz_triggers WHERE sched_name='" sched "'"))
          (t2/query (str "DELETE FROM qrtz_job_details WHERE sched_name='" sched "'")))))))
