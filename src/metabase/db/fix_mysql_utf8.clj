(ns metabase.db.fix-mysql-utf8
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase.util :as u])
  (:import java.sql.DatabaseMetaData))

(defn- warn-on-old-mysql-versions [^DatabaseMetaData metadata]
  (when (< (db-version metadata) 5.7)
    ;; TODO - warn
    ))

(defn- db-version [^DatabaseMetaData metadata]
  (Double/parseDouble
   (format "%d.%d" (.getDatabaseMajorVersion metadata) (.getDatabaseMinorVersion metadata))))

(defn- tables [^DatabaseMetaData metadata database-name]
  (reduce
   (fn [acc table]
     (conj acc (:table_name table)))
   []
   (jdbc/reducible-result-set (.getTables metadata database-name nil "%" (u/varargs String ["TABLE"])) nil)))

(defn change-to-utf8mb4 [jdbc-spec database-name]
  (jdbc/with-db-connection [conn jdbc-spec]
    (letfn [(execute! [sql-args]
              (log/info sql-args)
              (jdbc/execute! conn sql-args))]
      (execute! "SET foreign_key_checks = 0;")
      ;; Modify database
      (execute! (format "ALTER DATABASE `%s` CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;" database-name))
      (let [metadata (.getMetaData (jdbc/get-connection conn))]
        ;; Modify tables
        (doseq [table-name (tables metadata database-name)]
          (execute! (format "ALTER TABLE `%s` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" table-name))))
      (execute! "SET foreign_key_checks = 1;"))))
