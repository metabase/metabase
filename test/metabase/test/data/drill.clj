(ns metabase.test.data.drill
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [clojure.data.csv :as csv]
            [environ.core :refer [env]]
            [medley.core :as m]
            (metabase.driver [generic-sql :as sql])
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

(defn database->connection-details [context {:keys [database-name]}]
  (merge {:zookeeper-connect "localhost:2181/drill/drillbits1;schema=dfs.tmp"}))

(defn quote-name [nm]
  (str \` nm \`))

(defn make-sure-file-exists! [path]
  (let [file-path (clojure.java.io/file path)]
    (when-not (.exists file-path)
      (.createNewFile file-path))))

(defn create-table-sql [{:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [table-path (str "/tmp/" database-name "-" table-name ".csv")]
    ;; we can't create the view unless the file exists, so create an empty one if necessary
    (make-sure-file-exists! table-path)
    (format "CREATE VIEW %s AS SELECT %s FROM dfs.`%s`"
            (str "dfs.tmp.`" database-name "_" table-name "`")
            (str (->> field-definitions
                      (map (fn [{:keys [field-name base-type]}]
                             (format "CAST(`%s` AS %s) AS `%s`"
                                     field-name
                                     (field-base-type->sql-type base-type)
                                     field-name)))
                      (interpose ", ")
                      (apply str))
                 ", CAST(`id` as INTEGER) AS `id` ")
            table-path)))

(defn drop-table-if-exists-sql [{:keys [database-name]} {:keys [table-name]}]
  (format "DROP VIEW IF EXISTS %s" (str "dfs.tmp.`" database-name "_" table-name "`")))

;; workaround for DRILL-5136 (can't use prepared statements for DDL)
(defn drill-execute-sql! [driver context dbdef sql]
  (let [sql (some-> sql s/trim)]
    (when (and (seq sql)
               ;; make sure SQL isn't just semicolons
               (not (s/blank? (s/replace sql #";" ""))))
      ;; Remove excess semicolons, otherwise snippy DBs like Oracle will barf
      (let [sql (s/replace sql #";+" ";")]
        (try
          (with-open [conn (jdbc/get-connection (generic/database->spec driver context dbdef))]
            (with-open [statement (.createStatement conn)]
              (.execute statement sql)))
          (catch SQLException e
            (printf "Caught SQLException:\n%s\n"
                    (with-out-str (jdbc/print-sql-exception-chain e)))
            (throw e))
          (catch Throwable e
            (printf "Caught Exception: %s %s\n%s\n" (class e) (.getMessage e)
                    (with-out-str (.printStackTrace e)))
            (throw e)))))))

(defn sequentially-execute-sql!
  "Alternative implementation of `execute-sql!` that executes statements one at a time for drivers
   that don't support executing multiple statements at once.

   Since there are some cases were you might want to execute compound statements without splitting, an upside-down ampersand (`⅋`) is understood as an
   \"escaped\" semicolon in the resulting SQL statement."
  [driver context dbdef sql]
  (when sql
    (doseq [statement (map s/trim (s/split sql #";+"))]
      (when (seq statement)
        ()
        (drill-execute-sql! driver context dbdef (s/replace statement #"⅋" ";"))))))

(defn load-data! [driver
                  {:keys [database-name], :as dbdef}
                  {:keys [table-name field-definitions], :as tabledef}]
  (let [spec       (generic/database->spec driver :db dbdef)
        rows       (for [[i row] (m/indexed (generic/load-data-get-rows driver dbdef tabledef))]
                     (assoc row :id (inc i)))
        table-path (str "/tmp/" database-name "-" table-name ".csv")]
    (.delete (clojure.java.io/file table-path))
    (with-open [out (clojure.java.io/writer table-path)]
      (csv/write-csv out [(->> rows first keys (map name))])
      (csv/write-csv out (map vals rows)))))

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

                         :load-data!                load-data!
                         :pk-sql-type               (constantly "INT")
                         :quote-name                (u/drop-first-arg quote-name)})
                 i/IDatasetLoader
                 (merge generic/IDatasetLoaderMixin
                        {:database->connection-details (u/drop-first-arg database->connection-details)
                         :default-schema               (constantly "dfs.tmp")
                         :engine                       (constantly :drill)}))
