(ns metabase-enterprise.transforms.tracking
  (:require
   [metabase.config.core :as config]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute])
  (:import
   (java.sql
    PreparedStatement)))

(set! *warn-on-reflection* true)

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
  [work-id work-type mb-source]
  (first (first (run-query! :postgres (config/config-str :mb-worker-db)
                            "INSERT INTO worker_runs (work_id, type, source, status) VALUES (?, ?, ?, ?) RETURNING run_id"
                            [work-id work-type mb-source "running"]))))

(defn track-finish!
  [run-id]
  (run-update! :postgres (config/config-str :mb-worker-db)
               "UPDATE worker_runs SET status = ?, end_time = now() WHERE run_id = ?"
               ["success" run-id]))

(defn track-error!
  [run-id]
  (run-update! :postgres (config/config-str :mb-worker-db)
               "UPDATE worker_runs SET status = ?, end_time = now() WHERE run_id = ?"
               ["error" run-id]))

(defn get-status
  [run-id mb-source]
  (first (run-query! :postgres (config/config-str :mb-worker-db)
                     "SELECT status FROM worker_runs WHERE run_id = ? AND source = ?"
                     [run-id mb-source])))

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
