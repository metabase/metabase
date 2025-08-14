(ns metabase-enterprise.worker.tracking
  (:require
   [java-time.api :as t]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase.config.core :as config]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute])
  (:import
   (java.sql
    PreparedStatement)))

(set! *warn-on-reflection* true)

(defn- worker-db []
  (assert (config/config-str :mb-worker-db) "Must have env var MB_WORKER_DB set to run this function.")
  (config/config-str :mb-worker-db))

(defn- run-query! [driver conn-str sql params]
  (with-open [conn (java.sql.DriverManager/getConnection conn-str)
              stmt (sql-jdbc.execute/statement-or-prepared-statement driver
                                                                     conn
                                                                     sql
                                                                     params
                                                                     nil)]
    (let [rs (if (instance? PreparedStatement stmt)
               (.executeQuery ^PreparedStatement stmt)
               (.executeQuery stmt sql))
          rsmeta (.getMetaData rs)]
      (into [] (sql-jdbc.execute/reducible-rows driver rs rsmeta)))))

(defn- run-update! [driver conn-str sql params]
  (with-open [conn (java.sql.DriverManager/getConnection conn-str)
              stmt (sql-jdbc.execute/statement-or-prepared-statement driver
                                                                     conn
                                                                     sql
                                                                     params
                                                                     nil)]
    (if (instance? PreparedStatement stmt)
      (.executeUpdate ^PreparedStatement stmt)
      (.executeUpdate stmt sql))))

(defn track-start!
  [run-id mb-source]
  (-> (run-update! :postgres (worker-db)
                   "
INSERT INTO worker_runs (run_id, source, status)
SELECT ?, ?, 'running'
WHERE NOT EXISTS (
    SELECT 1 FROM worker_runs WHERE run_id = ?
);"

                   [run-id mb-source run-id])
      (= 1))) ;; new?

(defn set-status!
  ([run-id status]
   (set-status! run-id status ""))
  ([run-id status note]
   (run-update! :postgres (worker-db)
                "UPDATE worker_runs
                 SET status = ?, end_time = now(), note = ?
                 WHERE run_id = ? AND status = 'running'"
                [status note run-id])
   :ok))

(defn track-finish!
  [run-id]
  (set-status! run-id "success"))

(defn track-error!
  [run-id msg]
  (set-status! run-id "error" msg))

(defn track-cancel!
  [run-id msg]
  (set-status! run-id "canceled" msg))

(defn mark-cancel-started-run! [run-id mb-source]
  (-> (run-update! :postgres (worker-db)
                   "
INSERT INTO worker_runs_cancelation (run_id)
SELECT ?
WHERE EXISTS (
  SELECT 1 FROM worker_runs WHERE run_id = ? AND status = 'running' AND source = ?
) AND NOT EXISTS (
  SELECT 1 FROM worker_runs_cancelation WHERE run_id = ?
)
"
                   [run-id run-id mb-source run-id])
      (= 1)))

(def ^:private timeout-sec (* (transforms/transform-timeout) 60) #_sec)

(defn- handle-timeout
  [run]
  (if (and (= "running" (:status run))
           (> (:run-time run) timeout-sec))
    (-> run
        (assoc :status "timeout")
        (assoc :end-time (t/plus (:start-time run) (t/duration (transforms/transform-timeout) :minutes)))
        (assoc :note "Timed out.")
        (dissoc :run-time))
    (dissoc run :run-time)))

(defn get-status
  [run-id mb-source]
  (->> (run-query! :postgres (worker-db)
                   "SELECT run_id, status, start_time, end_time, note, EXTRACT(EPOCH FROM now() - start_time) as run_time
                      FROM worker_runs
                      WHERE run_id = ? AND source = ?"
                   [run-id mb-source])
       first ;; row
       (zipmap [:run-id :status :start-time :end-time :note :run-time])
       handle-timeout
       not-empty))

(defn timeout-old-tasks
  []
  (run-update! :postgres (worker-db)
               "UPDATE worker_runs
                  SET status = ?, end_time = NOW(), note = ?
                  WHERE status = 'running' AND start_time < NOW() - (? * INTERVAL '1 minute')"
               ["timeout" "Timed out by worker" (transforms/transform-timeout)]))

(defn cancel-old-cancelations!
  []
  ;; update the status of canceled runs > 1 minute old
  (run-update! :postgres (worker-db)
               "UPDATE worker_runs
                  SET status = 'canceled', end_time = NOW(), note = ?
                  WHERE status = 'running' AND
                        run_id IN (
       SELECT run_id
       FROM worker_runs_cancelation
       WHERE time < (NOW() - INTERVAL '1 minute')
                                  )"
               ["Canceled by user but could not guarantee run stopped"])
  ;; delete cancelations of all runs that are not running
  (run-update! :postgres (config/config-str :mb-worker-db)
               "DELETE FROM worker_runs_cancelation
                WHERE run_id NOT IN (
SELECT wrc.run_id
FROM   worker_runs_cancelation AS wrc
JOIN   worker_runs AS wr ON wr.run_id = wrc.run_id
WHERE  wr.status = 'running'
)"
               []))

(comment

  (let [driver :postgres
        sql "SELECT * from worker_runs"]

    (with-open [conn (java.sql.DriverManager/getConnection "jdbc:postgresql://localhost:5432/worker")]
      (with-open [stmt (sql-jdbc.execute/statement-or-prepared-statement driver
                                                                         conn
                                                                         sql
                                                                         []
                                                                         nil)]
        (let [rs (if (instance? PreparedStatement stmt)
                   (.executeQuery ^PreparedStatement stmt)
                   (.executeQuery stmt sql))
              rsmeta (.getMetaData rs)]
          (into [] (sql-jdbc.execute/reducible-rows driver rs rsmeta))))))

  (let [driver :postgres
        sql "insert into worker_runs (work_id, type, source, status) values (?, ?, ?, ?) RETURNING run_id"]

    (with-open [conn (java.sql.DriverManager/getConnection "jdbc:postgresql://localhost:5432/worker")]
      (with-open [stmt (sql-jdbc.execute/statement-or-prepared-statement driver
                                                                         conn
                                                                         sql
                                                                         [1, "sql-transform", "mb-1", "running"]
                                                                         nil)]
        (let [rs (if (instance? PreparedStatement stmt)
                   (.executeQuery ^PreparedStatement stmt)
                   (.executeQuery stmt sql))
              rsmeta (.getMetaData rs)]
          (into [] (sql-jdbc.execute/reducible-rows driver rs rsmeta)))))))

(comment

  (alter-var-root #'environ.core/env assoc :mb-worker-db "jdbc:postgresql://localhost:5432/worker")

  (def id (str (metabase.util/generate-nano-id)))
  (track-start! id "mb-1")

  (mark-cancel-started-run! id "mb-1")

  (cancel-old-cancelations!)
  (track-finish! id)
  (track-error! id "oops")

  (get-status id "mb-1"))
