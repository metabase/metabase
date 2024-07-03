(ns metabase.driver.postgres.test-data
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc.spec :as spec]
   [metabase.test.test-data :as test.test-data]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private database-sql
  (str/join
   \newline
   ["DO $$ BEGIN"
    "  PERFORM pg_terminate_backend(pg_stat_activity.pid)"
    "  FROM pg_stat_activity"
    "  WHERE pid <> pg_backend_pid()"
    "    AND pg_stat_activity.datname = 'test-data';"
    "END $$;"
    ""
    "-----"
    ""
    "DROP DATABASE IF EXISTS \"test-data\";"
    ""
    "-----"
    ""
    "CREATE DATABASE \"test-data\";"]))

#_{:clj-kondo/ignore [:discouraged-var]}
(mu/defn ^:private print-field-sql
  [driver :- ::test.test-data/driver
   field  :- ::test.test-data/schema.field]
  ;; write field name
  (printf "\"%s\"" (:name field))
  ;; write field type
  (print " ")
  (print (u/lower-case-en (sql.tx/field-base-type->sql-type driver (:base-type field))))
  ;; write field modifiers
  (when (:pk? field)
    (print " PRIMARY KEY"))
  (when (:not-null? field)
    (print " NOT NULL"))
  (when (:unique? field)
    (print " UNIQUE"))
  (when-let [[table-name field-name] (:fk field)]
    (printf " REFERENCES \"%s\" (\"%s\")" table-name field-name))
  (when-let [comment (:comment field)]
    (printf " COMMENT '%s'" (str/replace comment #"'" "''"))))

#_{:clj-kondo/ignore [:discouraged-var]}
(mu/defn ^:private print-table-sql
  [driver :- ::test.test-data/driver
   table  :- ::test.test-data/schema.table]
  (printf "CREATE TABLE \"%s\" (" (:name table))
  (loop [[field & more] (:fields table)]
    (print "\n  ")
    (print-field-sql driver field)
    (when (seq more)
      (print ",")
      (recur more)))
  (println "\n);")
  (when (:comment table)
    (throw (UnsupportedOperationException. "Table comment is not yet implemented")))
  (doseq [field (:fields table)
          :when (:indexed? field)]
    (throw (UnsupportedOperationException. "Field index is not yet implemented."))))

#_{:clj-kondo/ignore [:discouraged-var]}
(mu/defn ^:private print-tables-sql
  [driver   :- ::test.test-data/driver
   database :- ::test.test-data/schema.database]
  (loop [[table & more] (:tables database)]
    (print-table-sql driver table)
    (when (seq more)
      (println)
      (println "-----")
      (println)
      (recur more))))

#_{:clj-kondo/ignore [:discouraged-var]}
(mu/defmethod test.test-data/create-schema-artifacts-method! :postgres :- ::test.test-data/artifacts
  [driver            :- ::test.test-data/driver
   target-directory  :- :string
   database          :- ::test.test-data/schema.database]
  (let [db-filename     (format "%s/schema_db.sql" target-directory)
        tables-filename (format "%s/schema_tables.sql" target-directory)]
    (with-open [w (java.io.FileWriter. db-filename)]
      (binding [*out* w]
        (println database-sql)))
    (log/infof "[%s] wrote %s" driver db-filename)
    (with-open [w (java.io.FileWriter. tables-filename)]
      (binding [*out* w]
        (print-tables-sql driver database)))
    (log/infof "[%s] wrote %s" driver tables-filename)
    {:server [{:filename db-filename}]
     :db     [{:filename tables-filename}]}))

#_{:clj-kondo/ignore [:discouraged-var]}
(mu/defn print-csv-header
  [table :- ::test.test-data/schema.table]
  (loop [[field & more] (:fields table)]
    (printf "\"%s\"" (:name field))
    (when (seq more)
      (print ",")
      (recur more))))

(defprotocol ^:private ToCSV
  (->csv [x]))

(extend-protocol ToCSV
  nil
  (->csv [_nil]
    "NULL")

  Object
  (->csv [x]
    (pr-str x))

  java.time.LocalTime
  (->csv [t]
    (pr-str (u.date/format "HH:mm:ss.SSS" t)))

  java.time.OffsetTime
  (->csv [t]
    (->csv (t/local-time (u.date/with-time-zone-same-instant t (t/zone-id "UTC")))))

  java.time.LocalDate
  (->csv [t]
    (pr-str (u.date/format t)))

  java.time.LocalDateTime
  (->csv [t]
    (pr-str (u.date/format "yyyy-MM-dd HH:mm:ss.SSS" t)))

  java.time.OffsetDateTime
  (->csv [t]
    (pr-str (u.date/format "yyyy-MM-dd HH:mm:ss.SSS xxx" t)))

  java.time.ZonedDateTime
  (->csv [t]
    (->csv (t/offset-date-time t))))

#_{:clj-kondo/ignore [:discouraged-var]}
(defn- print-value [x]
  (print (->csv x)))

#_{:clj-kondo/ignore [:discouraged-var]}
(defn- print-row [row]
  (loop [[value & more] row]
    (print-value value)
    (when (seq more)
      (print ",")
      (recur more))))

#_{:clj-kondo/ignore [:discouraged-var]}
(mu/defn ^:private print-csv-rows
  [rows :- ::test.test-data/reducible-rows]
  (reduce
   (fn [_ row]
     (print-row row)
     (println))
   nil
   rows))

#_{:clj-kondo/ignore [:discouraged-var]}
(mu/defn ^:private print-table-rows
  [_driver :- ::test.test-data/driver
   table   :- ::test.test-data/schema.table
   rows    :- ::test.test-data/reducible-rows]
  (print-csv-header table)
  (println)
  (print-csv-rows rows))

#_{:clj-kondo/ignore [:discouraged-var]}
(mu/defn ^:private print-table-copy-sql
  [csv-filename :- :string
   table        :- ::test.test-data/schema.table]
  (printf "COPY \"%s\"\n" (:name table))
  (printf "FROM '%s'\n" csv-filename)
  #_(println "FORMAT CSV")
  #_(println "HEADER")
  (println "ESCAPE '\\'")
  (println "DELIMITER ','")
  (println "QUOTE '\"'")
  (println "NULL 'NULL'")
  (println "CSV HEADER;"))

(mu/defmethod test.test-data/create-data-artifacts-method! :postgres :- ::test.test-data/artifacts
  [driver           :- ::test.test-data/driver
   target-directory :- :string
   table            :- ::test.test-data/schema.table
   rows             :- ::test.test-data/reducible-rows]
  (let [csv-filename (format "%s/data_%s.csv" target-directory (munge (:name table)))
        sql-filename (format "%s/data_%s.sql" target-directory (munge (:name table)))]
    (with-open [w (java.io.FileWriter. csv-filename)]
      (binding [*out* w]
        (print-table-rows driver table rows)))
    (log/infof "[%s] wrote %s" driver sql-filename)
    (with-open [w (java.io.FileWriter. sql-filename)]
      (binding [*out* w]
        (print-table-copy-sql csv-filename table)))
    (log/infof "[%s] wrote %s" driver csv-filename)
    {:db [{:filename sql-filename}]}))

(defn- execute-statements!
  [driver ^java.sql.Connection connection statements]
  (with-open [stmt (.createStatement connection)]
    (doseq [^String sql statements]
      (assert (string? sql))
      (log/infof "[%s]\n%s" driver sql)
      (.execute stmt sql))))

(defn- script->statements [filename]
  (assert (.exists (io/file filename))
          (format "file does not exist: %s" (pr-str filename)))
  (with-open [r (java.io.BufferedReader. (java.io.FileReader. (io/file filename)))]
    (loop [statements [], current-statement-builder (StringBuilder.)]
      (let [line (.readLine r)]
        (cond
          (not line)
          (conj statements (.toString current-statement-builder))

          (= line "-----")
          (recur (conj statements (.toString current-statement-builder)) (StringBuilder.))

          (str/blank? line)
          (recur statements current-statement-builder)

          :else
          (recur statements (doto current-statement-builder
                              (.append line)
                              (.append "\n"))))))))

(defn- load-artifact!
  [driver ^java.sql.Connection connection artifact]
  (let [filename (:filename artifact)]
    (log/infof "[%s] executing SQL in %s" driver filename)
    (execute-statements! driver connection (script->statements filename))))

(mu/defmethod test.test-data/load-artifacts-method! :postgres
  [driver    :- ::test.test-data/driver
   artifacts :- ::test.test-data/artifacts]
  (log/infof "[%s] Executing statements against server..." driver)
  (with-open [server-connection #_{:clj-kondo/ignore [:discouraged-var]} (jdbc/get-connection (spec/dbdef->spec driver :server {:database-name "test-data"}))]
    (doseq [artifact (:server artifacts)]
      (load-artifact! driver server-connection artifact)))
  (log/infof "[%s] Executing statements against database..." driver)
  (with-open [db-connection #_{:clj-kondo/ignore [:discouraged-var]} (jdbc/get-connection (spec/dbdef->spec driver :db {:database-name "test-data"}))]
    (doseq [artifact (:db artifacts)]
      (load-artifact! driver db-connection artifact))))
