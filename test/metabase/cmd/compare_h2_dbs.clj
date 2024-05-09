(ns metabase.cmd.compare-h2-dbs
  "Utility functions for comparing the contents of two H2 DBs, for testing the `load-from-h2 and `dump-to-h2` commands."
  (:require
   [clojure.data :as data]
   [clojure.java.jdbc :as jdbc]
   [metabase.db]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(comment metabase.db/keep-me)

(defn- jdbc-spec [db-file]
  {:classname         "org.h2.Driver"
   :subprotocol       "h2"
   :subname           (str "file:" db-file)
   "IFEXISTS"         "TRUE"
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
  (sql-jdbc.execute/do-with-connection-with-options
   :h2
   spec
   nil
   (fn [^java.sql.Connection conn]
     (let [metadata (.getMetaData conn)
           result (jdbc/metadata-result
                   (.getTables metadata nil "PUBLIC" nil
                               (into-array String ["TABLE" "VIEW" "FOREIGN TABLE" "MATERIALIZED VIEW"])))]
       (sort (remove ignored-table-names (map :table_name result)))))))

(defmulti ^:private normalize-value
  class)

(defmethod normalize-value :default
  [v]
  v)

(def ^:private ignored-keys
  #{:created_at :updated_at :timestamp :last_login :date_joined :last_analyzed})

(defn- normalize-values [row]
  (into {} (for [[k v] row
                 :when (not (ignored-keys (keyword (u/lower-case-en (name k)))))]
             [k (normalize-value v)])))

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
  "True if the set of tables names is different between DBs represented by `conn-1` and `conn-2`."
  [conn-1 conn-2]
  (let [[table-names-1 table-names-2] (map table-names [conn-1 conn-2])
        _                             (log/infof "Diffing %d/%d table names..." (count table-names-1) (count table-names-2))
        [only-in-1 only-in-2]         (data/diff table-names-1 table-names-2)]
    (when (or (seq only-in-1) (seq only-in-2))
      (log/error "Tables are different!")
      (log/errorf "Only in first DB:\n%s" (u/pprint-to-str only-in-1))
      (log/errorf "Only in second DB:\n%s" (u/pprint-to-str only-in-2))
      :table-names-are-different)))

(defn- different-rows-for-table?
  "Diff the rows belonging to a specific table for two DBs. Returns truthy value if there is a difference."
  [conn-1 conn-2 table-name]
  (let [rows-1                (rows conn-1 table-name)
        rows-2                (rows conn-2 table-name)
        _                     (log/infof "Diffing %d/%d rows for table %s..." (count rows-1) (count rows-2) table-name)
        [only-in-1 only-in-2] (data/diff rows-1 rows-2)]
    (when (or (seq only-in-1) (seq only-in-2))
      (log/errorf "DBs have different sets of rows for Table %s" table-name)
      (log/errorf "Only in first DB:\n%s" (u/pprint-to-str only-in-1))
      (log/errorf "Only in second DB:\n%s" (u/pprint-to-str only-in-2))
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

(defn different-contents?
  "Diff contents of 2 DBs. Returns truthy if there is a difference, falsey if not."
  [db-file-1 db-file-2]
  (let [spec-1 (jdbc-spec db-file-1)
        spec-2 (jdbc-spec db-file-2)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver/*driver*
     spec-1
     nil
     (fn [db-1-connection]
       (let [spec-1 {:connection db-1-connection}]
         (sql-jdbc.execute/do-with-connection-with-options
          driver/*driver*
          spec-2
          nil
          (fn [db-2-connection]
            (let [spec-2 {:connection db-2-connection}]
              (or (different-table-names? spec-1 spec-2)
                  (different-rows? spec-1 spec-2))))))))))
