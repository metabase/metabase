(ns ^:synchronized metabase.task.sqlite-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.classloader.core :as classloader]
   [metabase.mq.quartz-affinity :as affinity]
   [metabase.task.bootstrap :as bootstrap]
   [metabase.task.impl :as task]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream ObjectOutputStream)
   (java.nio.file Files)
   (java.sql DriverManager)
   (java.time Instant)
   (java.util Date UUID)
   (org.quartz CronScheduleBuilder Job JobBuilder JobKey SimpleScheduleBuilder TriggerBuilder TriggerKey)
   (org.quartz.impl DirectSchedulerFactory)
   (org.quartz.impl.calendar HolidayCalendar)
   (org.quartz.impl.jdbcjobstore JobStoreTX)
   (org.quartz.simpl SimpleThreadPool)
   (org.quartz.utils ConnectionProvider DBConnectionManager)))

(set! *warn-on-reflection* true)

(defonce ^:private executions (atom nil))

(deftype SqliteTestJob []
  Job
  (execute [_ ctx]
    (when-let [p @executions]
      (deliver p (with-meta (into {} (.getMergedJobDataMap ctx)) {:recovering? (.isRecovering ctx)})))))

(defn- connection ^java.sql.Connection [^String url]
  (let [properties (doto (java.util.Properties.)
                     (.setProperty "transaction_mode" "IMMEDIATE"))
        conn (DriverManager/getConnection url properties)]
    (with-open [s (.createStatement conn)]
      (.execute s "PRAGMA busy_timeout=5000")
      (.execute s "PRAGMA foreign_keys=ON"))
    conn))

(defn- create-tables! [url]
  (with-open [conn (connection url)
              s (.createStatement conn)]
    (.execute s "PRAGMA journal_mode=WAL")
    (doseq [sql (str/split (str/replace (slurp (io/resource "org/quartz/impl/jdbcjobstore/tables_hsqldb.sql"))
                                        #"(?m)^--.*$" "") #";")
            :when (str/starts-with? (str/trim sql) "CREATE")]
      (.execute s sql))))

(defn- scheduler ^org.quartz.Scheduler [name url delegate]
  (let [provider-name (str name "-" (UUID/randomUUID))
        provider (reify ConnectionProvider
                   (initialize [_])
                   (shutdown [_])
                   (getConnection [_] (connection url)))
        store (doto (JobStoreTX.)
                (.setDataSource provider-name)
                (.setDriverDelegateClass delegate)
                (.setIsClustered false)
                (.setUseDBLocks false)
                (.setAcquireTriggersWithinLock true))
        factory (DirectSchedulerFactory/getInstance)]
    (.addConnectionProvider (DBConnectionManager/getInstance) provider-name provider)
    (.createScheduler factory name (get (bootstrap/jdbc-lock-properties :sqlite) "org.quartz.scheduler.instanceId") (SimpleThreadPool. 2 5) store)
    (.getScheduler factory name)))

(deftest sqlite-lock-properties-test
  (is (= {"org.quartz.scheduler.instanceId" "NON_CLUSTERED"
          "org.quartz.jobStore.isClustered" "false"
          "org.quartz.jobStore.useDBLocks" "false"
          "org.quartz.jobStore.acquireTriggersWithinLock" "true"}
         (bootstrap/jdbc-lock-properties :sqlite))))

(deftest sqlite-persistent-scheduler-test
  (testing "an isolated SQLite scheduler persists an EDN payload and fires it after restart"
    (let [path (Files/createTempFile "metabase-quartz-sqlite" ".db" (make-array java.nio.file.attribute.FileAttribute 0))
          url (str "jdbc:sqlite:" path)
          name (str "sqlite-test-" (UUID/randomUUID))
          delegate (affinity/ensure-delegate-loadable! :sqlite)
          payload {:nested [1 :two #{:three}]}
          job (-> (JobBuilder/newJob SqliteTestJob)
                  (.withIdentity "persisted")
                  (.storeDurably)
                  (.build))
          result (promise)
          scheduled? (atom false)]
      (.put (.getJobDataMap job) "payload" payload)
      (try
        (create-tables! url)
        (let [first-scheduler (scheduler name url delegate)]
          (try
            (with-open [conn (connection url)]
              (binding [mdb.connection/*application-db* (assoc mdb.connection/*application-db* :db-type :sqlite)]
                (t2/with-transaction [_ conn]
                  ;; Simulate an application write before scheduling on Quartz's separate connection.
                  (with-open [statement (.createStatement conn)]
                    (.executeUpdate statement "UPDATE QRTZ_LOCKS SET LOCK_NAME = LOCK_NAME"))
                  (t2/with-transaction [_ conn]
                    (task/do-after-app-db-commit #(do (.addJob first-scheduler job false)
                                                      (reset! scheduled? true))))
                  (is (false? @scheduled?)
                      "nested commit must not publish before the outer transaction commits"))
                (is (some? (.getJobDetail first-scheduler (.getKey job))))
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"rollback"
                                      (t2/with-transaction [_ conn]
                                        (task/do-after-app-db-commit #(.deleteJob first-scheduler (.getKey job)))
                                        (throw (ex-info "rollback" {})))))
                (is (some? (.getJobDetail first-scheduler (.getKey job)))
                    "rollback discards the scheduler update")))
            (.addCalendar first-scheduler "holidays" (HolidayCalendar.) false false)
            (.scheduleJob first-scheduler
                          (-> (TriggerBuilder/newTrigger)
                              (.withIdentity "cron")
                              (.forJob (.getKey job))
                              (.withSchedule (CronScheduleBuilder/cronSchedule "0 0 0 1 1 ? 2099"))
                              (.modifiedByCalendar "holidays")
                              (.build)))
            (.scheduleJob first-scheduler
                          (-> (TriggerBuilder/newTrigger)
                              (.withIdentity "on-restart")
                              (.forJob (.getKey job))
                              ;; Explicitly exercise misfire recovery after an hour offline.
                              (.startAt (Date/from (.minusSeconds (Instant/now) 3600)))
                              (.withSchedule (.withMisfireHandlingInstructionFireNow (SimpleScheduleBuilder/simpleSchedule)))
                              (.build)))
            (finally (.shutdown first-scheduler true))))
        (reset! executions result)
        (let [restarted (scheduler name url delegate)]
          (try
            (is (= payload (.get (.getJobDataMap (.getJobDetail restarted (JobKey. "persisted"))) "payload")))
            (is (instance? HolidayCalendar (.getCalendar restarted "holidays")))
            (is (= "0 0 0 1 1 ? 2099" (.getCronExpression ^org.quartz.CronTrigger (.getTrigger restarted (TriggerKey. "cron")))))
            (.start restarted)
            (is (= {"payload" payload} (deref result 10000 ::timeout)))
            (finally (.shutdown restarted true))))
        (finally
          (reset! executions nil)
          (doseq [suffix ["" "-wal" "-shm"]]
            (Files/deleteIfExists (.toPath (io/file (str path suffix))))))))))

(deftest sqlite-affinity-preserves-deserialization-allowlist-test
  (testing "the effective MQ delegate rejects serialized classes outside the allowlist"
    (let [delegate-class (Class/forName (affinity/ensure-delegate-loadable! :sqlite)
                                        true (classloader/the-classloader))
          delegate (.newInstance delegate-class)
          method (.getMethod delegate-class "getObjectFromBlob"
                             (into-array Class [java.sql.ResultSet String]))
          bytes (ByteArrayOutputStream.)]
      (with-open [out (ObjectOutputStream. bytes)]
        (.writeObject out (java.io.File. "not-job-data")))
      (with-open [conn (connection "jdbc:sqlite::memory:")
                  statement (.prepareStatement conn "SELECT ? AS data")]
        (.setBytes statement 1 (.toByteArray bytes))
        (with-open [rs (.executeQuery statement)]
          (.next rs)
          (is (thrown? java.io.InvalidClassException
                       (try
                         (.invoke method delegate (object-array [rs "data"]))
                         (catch java.lang.reflect.InvocationTargetException e
                           (throw (.getCause e)))))))))))

(deftest sqlite-interrupted-job-recovery-test
  (testing "a persisted executing-job marker is recovered after restarting the single-instance scheduler"
    (let [path (Files/createTempFile "sqlite-quartz-recovery" ".db" (make-array java.nio.file.attribute.FileAttribute 0))
          url (str "jdbc:sqlite:" path)
          name (str "sqlite-recovery-" (UUID/randomUUID))
          delegate (affinity/ensure-delegate-loadable! :sqlite)
          result (promise)]
      (try
        (create-tables! url)
        (let [initial (scheduler name url delegate)
              job (-> (JobBuilder/newJob SqliteTestJob)
                      (.withIdentity "recover")
                      (.requestRecovery)
                      (.storeDurably)
                      (.usingJobData "payload" "interrupted")
                      (.build))]
          (try
            (.scheduleJob initial job
                          (-> (TriggerBuilder/newTrigger)
                              (.withIdentity "original")
                              (.startAt (Date. (+ (System/currentTimeMillis) (* 60 60 1000))))
                              (.build)))
            (finally (.shutdown initial true))))
        ;; This is the durable state left by a process interrupted while executing a one-shot job.
        ;; Populate it directly so the test is deterministic and never kills the hosting REPL.
        (with-open [conn (connection url)
                    update (.createStatement conn)
                    insert (.prepareStatement conn
                                              (str "INSERT INTO QRTZ_FIRED_TRIGGERS "
                                                   "(SCHED_NAME, ENTRY_ID, TRIGGER_NAME, TRIGGER_GROUP, INSTANCE_NAME, "
                                                   "FIRED_TIME, SCHED_TIME, STATE, JOB_NAME, JOB_GROUP, "
                                                   "IS_NONCONCURRENT, REQUESTS_RECOVERY, PRIORITY) "
                                                   "VALUES (?, 'crashed', 'original', 'DEFAULT', 'NON_CLUSTERED', "
                                                   "?, ?, 'EXECUTING', 'recover', 'DEFAULT', 0, 1, 5)"))]
          (.executeUpdate update "UPDATE QRTZ_TRIGGERS SET TRIGGER_STATE = 'COMPLETE'")
          (.setString insert 1 name)
          (.setLong insert 2 (.toEpochMilli (.minusSeconds (Instant/now) 10)))
          (.setLong insert 3 (.toEpochMilli (.minusSeconds (Instant/now) 10)))
          (.executeUpdate insert))
        (reset! executions result)
        (let [restarted (scheduler name url delegate)]
          (try
            (.start restarted)
            (let [execution (deref result 10000 ::timeout)]
              (is (= "interrupted" (get execution "payload")))
              (is (true? (:recovering? (meta execution)))))
            (finally (.shutdown restarted true))))
        (with-open [conn (connection url)
                    stmt (.createStatement conn)
                    rows (.executeQuery stmt "SELECT count(*) FROM QRTZ_FIRED_TRIGGERS")]
          (.next rows)
          (is (zero? (.getLong rows 1))))
        (finally
          (reset! executions nil)
          (doseq [suffix ["" "-wal" "-shm"]]
            (Files/deleteIfExists (.toPath (io/file (str path suffix))))))))))
