(ns metabase.db.liquibase.mysql
  (:require [clojure.string :as str])
  (:import liquibase.database.core.MySQLDatabase
           liquibase.database.Database
           [liquibase.sql Sql UnparsedSql]
           [liquibase.sqlgenerator.core CreateTableGenerator SetColumnRemarksGenerator]
           liquibase.sqlgenerator.SqlGeneratorFactory
           liquibase.structure.DatabaseObject))

(defn- mysql? [database]
  (instance? MySQLDatabase database))

(defn- column-remarks-generator
  "Custom generator for `ALTER TABLE ... MODIFY COLUMN ... COMMENT` statements. Due to upstream bug
  https://github.com/liquibase/liquibase/issues/2634 these do not work correctly in MySQL. This SQL generator is a
  no-op generator that skips these statements (most of our column remarks are added in `CREATE TABLE` anyway, so we're
  not losing much.)"
  ^SetColumnRemarksGenerator []
  (proxy [SetColumnRemarksGenerator] []
    (getPriority []
      (let [^SetColumnRemarksGenerator this this]
        (inc (proxy-super getPriority))))

    (supports [statement database]
      (let [^SetColumnRemarksGenerator this this]
        (and (proxy-super supports statement database)
             (mysql? database))))

    (generateSql [_statement _database _sql-generator-chain]
      (into-array Sql []))))

(defn- create-table-generator
  "Custom generator for `CREATE TABLE` statements. This does two things:

  - Uses `current_timestamp(6)` as the current date time function
  - Adds `CHARACTER SET` and `COLLATE` info at the end of the statement to force UTF-8"
  ^CreateTableGenerator []
  (proxy [CreateTableGenerator] []
    (getPriority []
      (let [^CreateTableGenerator this this]
        (inc (proxy-super getPriority))))

    (supports [statement database]
      (let [^CreateTableGenerator this this]
        (and (proxy-super supports statement database)
             (mysql? database))))

    (generateSql [statement ^Database database sql-generator-chain]
      ;; it seems like Liquibase actually ignores the `defaultValueComputed`
      ;; that we set in the migrations YAML file -- see
      ;; https://stackoverflow.com/questions/58816496/force-liquibase-to-current-timestamp-instead-of-now
      (.setCurrentDateTimeFunction database "current_timestamp(6)")
      (let [^CreateTableGenerator this this]
        (into-array
         Sql
         (map (fn [^Sql sql]
                (if-not (str/starts-with? (.toSql sql) "CREATE TABLE")
                  sql
                  (UnparsedSql. (str (.toSql sql)
                                     " ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
                                (into-array DatabaseObject (.getAffectedDatabaseObjects sql)))))
              (proxy-super generateSql statement database sql-generator-chain)))))))

(defn register-mysql-generators!
  "Register our custom MySQL SQL generators."
  []
  (doto (SqlGeneratorFactory/getInstance)
    (.register (column-remarks-generator))
    (.register (create-table-generator))))
