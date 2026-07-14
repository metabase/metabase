(ns metabase.mq.quartz-affinity-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.classloader.core :as classloader]
   [metabase.mq.quartz-affinity :as affinity]
   [metabase.mq.queue.quartz :as q.quartz]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.lang.reflect Method)
   (java.time Instant)
   (org.quartz TriggerKey)
   (org.quartz.impl.jdbcjobstore Util)))

(set! *warn-on-reflection* true)

;; The integration test below reads/writes the QRTZ_* tables directly, so the app-db must be migrated.
(use-fixtures :once (fixtures/initialize :db))

;; The exact Quartz 2.3.2 selectTriggerToAcquire SQL (SCHED_NAME + table prefix already substituted).
(def ^:private acquire-sql
  (str "SELECT TRIGGER_NAME, TRIGGER_GROUP, NEXT_FIRE_TIME, PRIORITY FROM QRTZ_TRIGGERS"
       " WHERE SCHED_NAME = 'MetabaseScheduler' AND TRIGGER_STATE = ? AND NEXT_FIRE_TIME <= ?"
       " AND (MISFIRE_INSTR = -1 OR (MISFIRE_INSTR != -1 AND NEXT_FIRE_TIME >= ?))"
       " ORDER BY NEXT_FIRE_TIME ASC, PRIORITY DESC"))

(deftest rewrite-acquisition-sql-test
  (testing ":all disables filtering — sql unchanged"
    (is (= acquire-sql (affinity/rewrite-acquisition-sql acquire-sql :all))))
  (testing "empty capability set excludes ALL queue jobs, leaves other jobs"
    (let [out (affinity/rewrite-acquisition-sql acquire-sql #{})]
      (is (re-find #"AND \(job_group <> 'metabase\.mq\.queue'\) ORDER BY" out))
      (is (not (re-find #"job_name IN" out)))))
  (testing "a capability set gates the queue group by job_name IN (...)"
    (let [out (affinity/rewrite-acquisition-sql acquire-sql #{"alpha" "beta"})]
      (is (re-find #"AND \(job_group <> 'metabase\.mq\.queue' OR job_name IN \(" out))
      (is (re-find #"'alpha'" out))
      (is (re-find #"'beta'" out))
      (is (str/ends-with? out "ORDER BY NEXT_FIRE_TIME ASC, PRIORITY DESC"))))
  (testing "single-quotes in a queue name are escaped (no SQL injection / breakage)"
    (is (re-find #"'o''brien'" (affinity/rewrite-acquisition-sql acquire-sql #{"o'brien"})))))

(deftest queue-job-group-matches-quartz-backend-test
  (testing "the group we gate on is exactly the group the Quartz backend puts queue jobs in"
    (is (= @#'q.quartz/job-group affinity/queue-job-group))))

(deftest ensure-delegate-loadable!-produces-a-driver-delegate-subclass-test
  (testing "each app-db's affinity delegate loads (AOT in uberjar / runtime-compiled in dev), extends the right base, and overrides selectTriggerToAcquire"
    (doseq [[db-type base] {:h2       org.quartz.impl.jdbcjobstore.StdJDBCDelegate
                            :mysql    org.quartz.impl.jdbcjobstore.StdJDBCDelegate
                            :postgres org.quartz.impl.jdbcjobstore.PostgreSQLDelegate}]
      (let [class-name (affinity/ensure-delegate-loadable! db-type)
            k          (Class/forName class-name true (classloader/the-classloader))]
        (is (.isAssignableFrom ^Class base k)
            (str db-type " delegate extends " (.getSimpleName ^Class base)))
        (is (.isAssignableFrom org.quartz.impl.jdbcjobstore.DriverDelegate k)
            "is a DriverDelegate")
        (is (some (fn [^Method m] (and (= "selectTriggerToAcquire" (.getName m))
                                       (= 4 (count (.getParameterTypes m)))))
                  (.getDeclaredMethods k))
            "overrides the 4-arg selectTriggerToAcquire")))))

;;; Integration: run the real `selectTriggerToAcquire` re-implementation against the app DB (whatever
;;; type CI uses), proving the affinity predicate actually filters rows — and never touches non-queue
;;; jobs. Rows are isolated under a random sched_name so concurrent tests / the real scheduler are
;;; unaffected. Each row's trigger_name == its job_name, so the acquired TriggerKey names read back as
;;; the job names we assert on.

(def ^:private mq-group affinity/queue-job-group)

(defn- epoch-ms ^long [] (.toEpochMilli (Instant/now)))

(defn- seed! [sched rows]
  (let [now (epoch-ms)]
    (doseq [[jn jg] rows]
      (t2/query (str "INSERT INTO QRTZ_JOB_DETAILS (sched_name,job_name,job_group,job_class_name,is_durable,is_nonconcurrent,is_update_data,requests_recovery)"
                     " VALUES ('" sched "','" jn "','" jg "','x.Job',true,false,false,false)"))
      (t2/query (str "INSERT INTO QRTZ_TRIGGERS (sched_name,trigger_name,trigger_group,job_name,job_group,next_fire_time,priority,trigger_state,trigger_type,start_time,misfire_instr)"
                     " VALUES ('" sched "','" jn "','" jg "','" jn "','" jg "'," (- now 60000)
                     ",5,'WAITING','SIMPLE'," (- now 120000) ",-1)")))))

(defn- cleanup! [sched]
  (t2/query (str "DELETE FROM QRTZ_TRIGGERS WHERE sched_name='" sched "'"))
  (t2/query (str "DELETE FROM QRTZ_JOB_DETAILS WHERE sched_name='" sched "'")))

;; Stand in for the delegate's protected `rtp`: substitute {0}=table prefix, {1}=sched-name literal for
;; this test's isolated sched, using Quartz's own (MessageFormat-based) helper — so the query is exactly
;; what a real delegate would run, scoped to our rows.
(defn- test-rtp [sched]
  (fn [sql] (Util/rtp sql "QRTZ_" (str "'" sched "'"))))

(defn- acquire! [sched capability]
  (let [the-atom @#'affinity/capability-fn*   ; deref the var -> the atom
        prev     @the-atom                     ; deref the atom -> the current fn
        now      (epoch-ms)]
    (affinity/set-capability-fn! (constantly capability))
    (try
      (t2/with-connection [conn]
        (->> (affinity/select-trigger-to-acquire conn (+ now 3600000) (- now 3600000) 100 (test-rtp sched))
             (map (fn [^TriggerKey k] (.getName k)))
             set))
      (finally (reset! the-atom prev)))))

(deftest select-trigger-to-acquire-filters-by-capability-against-appdb-test
  (testing "select-trigger-to-acquire filters the acquisition query by capability, on the real app DB"
    (let [sched (str "AFFINITY_TEST_" (random-uuid))]
      (cleanup! sched)
      (seed! sched [["aff-queue-a" mq-group] ["aff-queue-b" mq-group] ["aff-sync" "DEFAULT"]])
      (try
        (is (= #{"aff-queue-a" "aff-queue-b" "aff-sync"} (acquire! sched :all))
            ":all acquires everything")
        (is (= #{"aff-queue-a" "aff-sync"} (acquire! sched #{"aff-queue-a"}))
            "capable of only queue-a acquires it + the non-queue job, not queue-b")
        (is (= #{"aff-sync"} (acquire! sched #{}))
            "no queue listeners → acquires no queue jobs, but the non-queue job still runs")
        (is (= #{"aff-sync"} (acquire! sched #{"nonexistent"}))
            "capable of an unrelated queue → only the non-queue job")
        (finally (cleanup! sched))))))
