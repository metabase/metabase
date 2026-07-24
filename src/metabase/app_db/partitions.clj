(ns metabase.app-db.partitions
  "The query_execution table is partitioned by date for performance.
  As time goes on, we need to ensure that new partitions are added and old ones
  get detached as they cycle out of the retention window.
  All public functions here are public only for testing purposes."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.env :as env]
   [metabase.audit-app.core :as audit-app]
   [metabase.task.core :as task]
   [next.jdbc :as next.jdbc]))

(set! *warn-on-reflection* true)

;;; pure functions

(defn- partition-for [date]
  (format "query_execution_%s_%02d" (t/year date) (.getValue (t/month date))))

(defn- date-for-partition [partition]
  ;; partitions are named like "query_execution_2026_07"
  (let [[_ year month] (re-find #"query_execution_(\d+)_(\d+)" partition)]
    (t/local-date (parse-long year) (parse-long month))))

(defn partitions-to-create
  "Given current partitions and the current time, what new partitions are needed?
  Returns a sequence of maps with :name, :from, and :to keys."
  [partitions now]
  (let [latest-date (apply t/max (t/local-date 1970) (map date-for-partition partitions))]
    (for [date [(t/adjust now :first-day-of-month)
                (t/adjust now :first-day-of-next-month)]
          :let [name (partition-for date)]
          :when (t/after? date latest-date)]
      {:name name
       :from (t/format "YYYY-MM-dd" date)
       :to (t/format "YYYY-MM-dd" (t/adjust date :first-day-of-next-month))})))

(defn- detach? [retention-cutoff partition]
  (t/before? (date-for-partition partition) retention-cutoff))

(defn partitions-to-detach
  "Given current partitions, time and retention days, which are due to be detached?"
  [partitions now retention-days]
  (if (or (nil? retention-days) (zero? retention-days))
    []
    (let [retention-cutoff (t/min (t/minus now (t/days retention-days))
                                  (t/adjust now :first-day-of-month))]
      (filter (partial detach? retention-cutoff) partitions))))

;;; and now for the side-effects...

(defn create-partition
  "Attach a new partition to query_execution."
  [conn {:keys [name from to]}]
  (next.jdbc/execute! conn [(format "CREATE TABLE \"%s\" PARTITION OF query_execution
                                        FOR VALUES FROM ('%s') TO ('%s')" name from to)]))

(defn- detach-partition [conn partition]
  (next.jdbc/execute! conn [(format "ALTER TABLE query_execution DETACH PARTITION \"%s\""
                                    partition)]))

(defn current-partitions
  "List the names of the currently-attached query_execution partition tables."
  [conn]
  (map :pg_class/relname
       (next.jdbc/execute! conn ["SELECT c.relname FROM pg_inherits i
                                    JOIN pg_class p ON i.inhparent = p.oid
                                    JOIN pg_class c ON i.inhrelid = c.oid
                                   WHERE p.relname='query_execution'"])))

(defn manage-partitions
  "Create new partitions and detach unnecessary partitions under Postgres."
  [conn now retention-days]
  (let [partitions (current-partitions conn)]
    (doseq [partition (partitions-to-create partitions now)]
      (create-partition conn partition))
    (doseq [partition (partitions-to-detach partitions now retention-days)]
      (detach-partition conn partition))))

;;; scheduling the jobs

(task/defjob ^:private ^{org.quartz.DisallowConcurrentExecution true}
  ManagePartitions [_]
  (when (= :postgres env/db-type) ; mysql/h2 don't have partitions
    (let [retention-days (audit-app/audit-max-retention-days)]
      (with-open [conn (.getConnection (connection/data-source))]
        (manage-partitions conn (t/local-date) retention-days)))))

(defmethod task/init! ::ManagePartitions [_]
  (let [job-key (jobs/key "metabase.app-db.partitions.job")
        trigger-key (triggers/key "metabase.app-db.partitions.trigger")
        job (jobs/build
             (jobs/of-type ManagePartitions)
             (jobs/with-identity job-key)
             (jobs/with-description "Manage DB partitions")
             (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/start-now)
                 ;; 3:21AM every day
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 21 3 * * ? *")
                   (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
