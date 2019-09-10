(ns metabase.cmd.compare-h2-dbs
  "Utility functions for comparing the contents of two H2 DBs, for testing the `load-from-h2 and `dump-to-h2` commands."
  (:require [clojure
             [data :as data]
             [pprint :as pprint]]
            [clojure.java.jdbc :as jdbc]
            [medley.core :as m]
            [metabase.util :as u])
  (:import org.h2.jdbc.JdbcClob))

(defn- jdbc-spec [db-file]
  {:classname         "org.h2.Driver"
   :subprotocol       "h2"
   :subname           (str "file:" db-file)
   "IFEXISTS"         "TRUE"
   "ACCESS_MODE_DATA" "r"
   ;; close DB right away when done
   "DB_CLOSE_DELAY"   "0"})

(def ^:private ignored-table-names
  "Set of Table names to skip diffing (e.g. because they're not ones we migrate.)"
  #{"DATABASECHANGELOG"
    "QRTZ_BLOB_TRIGGERS"
    "QRTZ_CALENDARS"
    "QRTZ_CRON_TRIGGERS"
    "QRTZ_FIRED_TRIGGERS"
    "QRTZ_JOB_DETAILS"
    "QRTZ_LOCKS"
    "QRTZ_PAUSED_TRIGGER_GRPS"
    "QRTZ_SCHEDULER_STATE"
    "QRTZ_SIMPLE_TRIGGERS"
    "QRTZ_SIMPROP_TRIGGERS"
    "QRTZ_TRIGGERS"
    "QUERY"
    "QUERY_QUERYEXECUTION"
    "QUERY_CACHE"
    "TASK_HISTORY"})

(defn- table-names
  "Return a sorted collection of all non-system table names."
  [spec]
  (jdbc/with-db-metadata [metadata spec]
    (let [result (jdbc/metadata-result
                  (.getTables metadata nil nil nil
                              (into-array String ["TABLE", "VIEW", "FOREIGN TABLE", "MATERIALIZED VIEW"])))]
      (sort (remove ignored-table-names (map :table_name result))))))

(defmulti ^:private normalize-value
  class)

(defmethod normalize-value :default
  [v]
  v)

(defmethod normalize-value JdbcClob
  [v]
  (u/jdbc-clob->str v))

(defn- normalize-values [row]
  (m/map-vals normalize-value row))

(defn- sort-rows [rows]
  (vec (sort-by (fn [row]
                  (or (:id row)
                      (vec (sort row))))
                rows)))

(defn- rows
  "Return a sorted collection of all rows for a Table."
  [spec table-name]
  (let [rows (jdbc/query spec (format "SELECT * FROM \"%s\";" table-name))]
    (->> rows (mapv normalize-values) sort-rows)))

(defn- different-table-names?
  "Diff the table names in two DBs. Returns a truthy value if there is a difference.
  the same."
  [conn-1 conn-2]
  (let [[table-names-1 table-names-2] (map table-names [conn-1 conn-2])
        _                             (printf "Diffing %d/%d table names...\n" (count table-names-1) (count table-names-2))
        [only-in-1 only-in-2]         (data/diff table-names-1 table-names-2)]
    (when (or (seq only-in-1) (seq only-in-2))
      (println "Tables are different!")
      (println "Only in first DB:")
      (pprint/pprint only-in-1)
      (println "Only in second DB:")
      (pprint/pprint only-in-2)
      :table-names-are-different)))

(defn- different-rows-for-table?
  "Diff the rows belonging to a specific table for two DBs. Returns truthy value if there is a difference."
  [conn-1 conn-2 table-name]
  (let [rows-1                (rows conn-1 table-name)
        rows-2                (rows conn-2 table-name)
        _                     (printf "Diffing %d/%d rows for table %s...\n" (count rows-1) (count rows-2) table-name)
        [only-in-1 only-in-2] (data/diff rows-1 rows-2)]
    (when (or (seq only-in-1) (seq only-in-2))
      (printf "DBs have different sets of rows for Table %s\n" table-name)
      (println "Only in first DB:")
      (pprint/pprint only-in-1)
      (println "Only in second DB:")
      (pprint/pprint only-in-2)
      :table-rows-are-different)))

(defn- different-rows?
  "Diff rows for all tables in two DBs. Returns truthy if there are any differences."
  [conn-1 conn-2]
  (reduce
   (fn [different? table-name]
     (or different?
         (different-rows-for-table? conn-1 conn-2 table-name)))
   false
   (distinct (sort (concat (table-names conn-1) (table-names conn-2))))))

(defn- different-contents?
  "Diff contents of 2 DBs. Returns truthy if there is a difference, falsey if not."
  [db-file-1 db-file-2]
  (jdbc/with-db-connection [conn-1 (jdbc-spec db-file-1)]
    (jdbc/with-db-connection [conn-2 (jdbc-spec db-file-2)]
      (or (different-table-names? conn-1 conn-2)
          (different-rows? conn-1 conn-2)))))


(defn diff-h2-dbs [db-file-1 db-file-2]
  (println (list 'diff-h2-dbs db-file-1 db-file-2)))

(defn -main [db-file-1 db-file-2]
  (when-let [difference (different-contents? db-file-1 db-file-2)]
    (println "DB contents are different. Reason:" difference)
    (System/exit 1))
  (println "Success: DB contents match.")
  (System/exit 0))
