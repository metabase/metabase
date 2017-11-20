(ns metabase.test.data.teradata
  "Code for creating / destroying a Teradata database from a `DatabaseDefinition`."
  (:require [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
    [metabase.driver.generic-sql :as sql]
    [metabase.util :as u]
    [clojure.java.jdbc :as jdbc]
    [clojure.string :as s])
  (:import metabase.driver.teradata.TeradataDriver
    java.sql.SQLException))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BYTEINT"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "FLOAT"
   :type/Integer    "INTEGER"
   :type/Text       "VARCHAR(2048)"
   :type/Time       "TIME"})

;; Tested using Teradata Express VM image. Set the host to the correct address if localhost does not work.
(defn- database->connection-details [context {:keys [database-name]}]
  (merge {:host         (i/db-test-env-var-or-throw :teradata :host "localhost")
          :user         (i/db-test-env-var :teradata :user "dbc")
          :password     (i/db-test-env-var :teradata :password "dbc")}))

(defn- drop-table-if-exists-sql [{:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE \"%s\".\"%s\"⅋" database-name table-name))

(defn- create-db-sql [{:keys [database-name]}]
  (format "CREATE user \"%s\" AS password=\"%s\" perm=524288000 spool=524288000;" database-name database-name))

(defn- drop-db-if-exists-sql [{:keys [database-name]}]
  (format "DELETE user \"%s\" ALL; DROP user \"%s\";" database-name database-name))

(defn- qualified-name-components
  ([db-name]                       [db-name])
  ([db-name table-name]            [db-name table-name])
  ([db-name table-name field-name] [db-name table-name field-name]))

(defn- database->spec [driver context dbdef]
  (sql/connection-details->spec driver (i/database->connection-details driver context dbdef)))

;; Overridden to be able to suppress db/table does not exist error.
(defn- execute-sql! [driver context dbdef sql]
  (let [sql (some-> sql s/trim)]
    (when (and (seq sql)
               ;; make sure SQL isn't just semicolons
               (not (s/blank? (s/replace sql #";" ""))))
      ;; Remove excess semicolons, otherwise snippy DBs like Oracle will barf
      (let [sql (s/replace sql #";+" ";")]
        (try
          (jdbc/execute! (database->spec driver context dbdef) [sql] {:transaction? false, :multi? true})
          (catch SQLException e
            (println "Error executing SQL:" sql)
            (printf "Caught SQLException:\n%s\n"
                    (with-out-str (jdbc/print-sql-exception-chain e)))
            ;; TODO Ignoring "drop if exists" errors. Remove as soon as we have a better solution.
            (if (not (or (s/includes? (.getMessage e) "Error 3807")
                       (s/includes? (.getMessage e) "Error 3802")))
              (throw e)))
          (catch Throwable e
            (println "Error executing SQL:" sql)
            (printf "Caught Exception: %s %s\n%s\n" (class e) (.getMessage e)
                    (with-out-str (.printStackTrace e)))
            (throw e)))))))

(defn- sequentially-execute-sql!
  "Alternative implementation of `execute-sql!` that executes statements one at a time for drivers
   that don't support executing multiple statements at once.

   Since there are some cases were you might want to execute compound statements without splitting, an upside-down ampersand (`⅋`) is understood as an
   \"escaped\" semicolon in the resulting SQL statement."
  [driver context dbdef sql]
  (when sql
    (doseq [statement (map s/trim (s/split sql #";+"))]
      (when (seq statement)
        (execute-sql! driver context dbdef (s/replace statement #"⅋" ";"))))))

(u/strict-extend TeradataDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
    {:create-db-sql             (u/drop-first-arg create-db-sql)
     :drop-db-if-exists-sql     (u/drop-first-arg drop-db-if-exists-sql)
     :drop-table-if-exists-sql  (u/drop-first-arg drop-table-if-exists-sql)
     :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
     :execute-sql!              sequentially-execute-sql!
     :load-data!                generic/load-data-one-at-a-time!
     :pk-sql-type               (constantly "INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1 MINVALUE -2147483647 MAXVALUE 2147483647 NO CYCLE)")
     :qualified-name-components (u/drop-first-arg qualified-name-components)})
  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
    {:database->connection-details       (u/drop-first-arg database->connection-details)
     :default-schema                     (constantly "test-data")
     :engine                             (constantly :teradata)}))