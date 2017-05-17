(ns metabase.test.data.drill
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [clojure.data.csv :as csv]
            [environ.core :refer [env]]
            [medley.core :as m]
            [honeysql.core :as hsql]
            (metabase.driver [generic-sql :as sql]
                             [drill :as drill-driver])
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [clojure.java.io :as io])
  (:import metabase.driver.drill.DrillDriver
           java.sql.SQLException))

(def ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "DOUBLE"
   :type/Integer    "INTEGER"
   :type/Text       "VARCHAR"})

(defn- dash-to-underscore [s]
  (s/replace s #"-" "_"))

(defn- qualified-name-components
  ([db-name]                       (map dash-to-underscore [db-name]))
  ([db-name table-name]            (map dash-to-underscore [db-name table-name]))
  ([db-name table-name field-name] (map dash-to-underscore [table-name field-name])))

(defn database->connection-details [context {:keys [database-name]}]
  (merge {:drill-connect "drillbit=localhost;schema=dfs.tmp"}))

(defn quote-name [nm]
  (str \` nm \`))

(defn make-sure-file-exists! [path]
  (let [file-path (clojure.java.io/file path)]
    (when-not (.exists file-path)
      (.createNewFile file-path))))

(defn create-table-sql [{:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [qualified-table-name (i/db-qualified-table-name database-name table-name)
        table-path (str "/tmp/" qualified-table-name "_table.csv")]
    ;; we can't create the view unless the file exists, so create an empty one if necessary
    (make-sure-file-exists! table-path)
    (format "CREATE OR REPLACE VIEW %s AS SELECT %s FROM dfs.`%s`"
            (str "dfs.tmp.`" qualified-table-name "`")
            (str (->> field-definitions
                      (map (fn [{:keys [field-name base-type]}]
                             (if (= base-type :type/DateTime)
                               (format "CAST(to_timestamp(`%s`, 'YYYY-MM-dd''T''HH:mm:ss.SSSZ') AS TIMESTAMP) AS `%s`"
                                       field-name field-name)
                               (format "CAST(`%s` AS %s) AS `%s`"
                                       field-name
                                       (field-base-type->sql-type base-type)
                                       field-name))))
                      (interpose ", ")
                      (apply str))
                 ", CAST(`id` as INTEGER) AS `id` ")
            table-path)))

(defn drop-table-if-exists-sql [{:keys [database-name]} {:keys [table-name]}]
  (format "DROP VIEW IF EXISTS %s" (str "dfs.tmp.`" database-name "_" table-name "`")))

;; workaround for DRILL-5136 (can't use prepared statements for DDL)
;; instead of prepared statements, we use plain statements.
(defn sequentially-execute-sql!
  "Alternative implementation of `execute-sql!` that executes statements one at a time for drivers
   that don't support executing multiple statements at once.

   Since there are some cases were you might want to execute compound statements without splitting, an upside-down ampersand (`⅋`) is understood as an
   \"escaped\" semicolon in the resulting SQL statement."
  [driver context dbdef sql]
  (when sql
    (try
      (with-open [conn (jdbc/get-connection (generic/database->spec driver context dbdef))]
        (doseq [statement (map s/trim (s/split (s/replace sql #"⅋" ";") #";+"))]
          (when (seq statement)
            (with-open [sql-statement (.createStatement conn)]
              (.execute sql-statement statement)))))
      (catch SQLException e
        (printf "Caught SQLException:\n%s\n"
                (with-out-str (jdbc/print-sql-exception-chain e)))
        (throw e))
      (catch Throwable e
        (printf "Caught Exception: %s %s\n%s\n" (class e) (.getMessage e)
                (with-out-str (.printStackTrace e)))
        (throw e)))))

(defn- unprepare [x]
  (if (instance? honeysql.types.SqlRaw x)
    (s/join " " (hsql/format x))
    (drill-driver/drill-unprepare-arg x)))

(defn make-row-formatter [field-definitions]
  (let [field-name->base-type (reduce (fn [acc {:keys [field-name base-type]}]
                                        (assoc acc field-name base-type))
                                      {}
                                      field-definitions)
        datetime-formatter (java.text.SimpleDateFormat. "YYYY-MM-dd'T'HH:mm:ss.SSS'Z'")]
    (fn [row]
      (map (fn [[column-key value]]
             (if (= (field-name->base-type (name column-key)) :type/DateTime)
               (.format datetime-formatter value)
               value))
           row))))

(defn load-data! [driver
                  {:keys [database-name], :as dbdef}
                  {:keys [table-name field-definitions], :as tabledef}]
  ;; if we have an instance of SqlRaw we'll have to use the big hammer
  ;; and actually run this in Drill. we can't do this for all statements
  ;; because there is a limit to how large the statements we send can be.
  ;; in practice this is currently (2017-04-24) only being used to create
  ;; relative time intervals. creating timestamps is incredibly slow when
  ;; there are more than a few hundred rows, for some reason, so we just
  ;; write .csv files directly when we can.
  (let [spec       (generic/database->spec driver :db dbdef)
        rows       (for [[i row] (m/indexed (generic/load-data-get-rows driver dbdef tabledef))]
                     (assoc row :id (inc i)))
        qualified-table-name (i/db-qualified-table-name database-name table-name)
        full-table-name (str "dfs.tmp.`" qualified-table-name "_table`")
        table-path (str "/tmp/" qualified-table-name "_table.csv")
        column-names (->> rows first keys (map name))
        create-table-as (format "CREATE TABLE %s AS SELECT %s FROM (VALUES (%s))"
                                full-table-name
                                (s/join ", " (for [[i column-name] (m/indexed column-names)]
                                 (str "expr$" i " `" column-name "`")))
                                (s/join "), (" (map (fn [vs]
                                                      (s/join "," (map unprepare vs)))
                                                    (map vals rows))))
        format-row (make-row-formatter field-definitions)]
    (if (some #(instance? honeysql.types.SqlRaw %) (->> rows second vals))
      (do
        (sequentially-execute-sql! driver nil dbdef
          (s/join "; " ["ALTER SESSION SET `store.format`='csv'"
                        (format "DROP TABLE IF EXISTS %s" full-table-name)
                        create-table-as]))
        ;; this is a very hacky way to do this. it would be better to
        ;; append all *.csv files in the directory into `table-path`
        (clojure.java.io/copy (io/file (str "/tmp/" qualified-table-name "_table"
                                        "/0_0_0.csv"))
                              (io/file table-path)))
      (do
        (.delete (clojure.java.io/file table-path))
        (with-open [out (clojure.java.io/writer table-path)]
          (csv/write-csv out [(->> rows first keys (map name))])
          (csv/write-csv out (map format-row rows)))))))

(u/strict-extend DrillDriver
                 generic/IGenericSQLDatasetLoader
                 (merge generic/DefaultsMixin
                        {:add-fk-sql                (constantly nil)
                         :execute-sql!              sequentially-execute-sql!
                         :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
                         :create-table-sql          (u/drop-first-arg create-table-sql)
                         :drop-table-if-exists-sql  (u/drop-first-arg drop-table-if-exists-sql)

                         ;; Drill doesn't have a concept of databases
                         :create-db-sql             (constantly nil)
                         :drop-db-if-exists-sql     (constantly nil)
                         :qualified-name-components (u/drop-first-arg qualified-name-components)

                         :load-data!                load-data!
                         :pk-sql-type               (constantly "INT")
                         :quote-name                (u/drop-first-arg quote-name)})
                 i/IDatasetLoader
                 (merge generic/IDatasetLoaderMixin
                        {:database->connection-details (u/drop-first-arg database->connection-details)
                         :default-schema               (constantly "dfs.tmp")
                         :engine                       (constantly :drill)}))
