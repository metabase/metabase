(ns dev.debug-test-data
  "Tools for introspecting and working with the test data loading code, especially the SQL JDBC reducible chunks and
  `INSERT` statements generated from them. Example usage:

    (dev.debug-test-data/jdbc-insert-rows-dml-statements
     :mysql
     'metabase.driver.sql-jdbc.sync.describe-table-test/json-int-turn-string
     \"json_with_pk\")
    ;; =>
    [[\"INSERT INTO `json_with_pk` (`json_col`) VALUES (?), (?), (?), (?), (?), (?)\"
      ...]]"
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql-jdbc.load-data :as sql-jdbc.load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util.malli :as mu]))

(mu/defn ->dbdef :- [:map [:database-name :string]]
  "Coerce something to a Database Definition. Can resolve string symbols from the current namespace or
  from [[metabase.test.data.dataset-definitions]]."
  [dbdeffable]
  (if (symbol? dbdeffable)
    (->dbdef (data.impl/resolve-dataset-definition (symbol (ns-name *ns*)) dbdeffable))
    (tx/get-dataset-definition dbdeffable)))

(mu/defn ->tabledef :- [:map [:table-name :string]]
  "Coerce something to a Table Definition. You can pass in a string table name to find the matching table from a
  Database Definition."
  [dbdeffable tabledeffable]
  (cond
    (and (map? tabledeffable)
         (:table-name tabledeffable))
    tabledeffable

    (string? tabledeffable)
    (let [dbdef (->dbdef dbdeffable)]
      (m/find-first #(= (:table-name %) tabledeffable)
                    (:table-definitions dbdef)))))

(defn dataset-already-loaded?
  "Check whether `driver` thinks a test dataset is already loaded or not.

    (dataset-already-loaded? :redshift 'test-data)"
  [driver dbdeffable]
  (tx/dataset-already-loaded? driver (->dbdef dbdeffable)))

(defn jdbc-create-db-ddl-statements
  "Return a sequence of DDL statements used to create the database itself for a Database Definition for `driver`."
  [driver dbdeffable]
  (ddl/create-db-ddl-statements driver (->dbdef dbdeffable)))

(defn jdbc-create-table-ddl-statements
  "Return a sequence of DDL statements used to create the tables in a Database Definition for `driver`."
  [driver dbdeffable]
  (ddl/create-db-tables-ddl-statements driver (->dbdef dbdeffable)))

(defn jdbc-reducible-chunks
  "Generate reducible chunks of rows from a table definition for a given `driver`, ultimately compiled to SQL `INSERT`
  statements (see below)."
  [driver dbdeffable tabledeffable]
  (let [dbdef            (->dbdef dbdeffable)
        tabledef         (->tabledef dbdef tabledeffable)]
    (#'sql-jdbc.load-data/reducible-chunks driver dbdef tabledef)))

(defn table-identifier
  "HoneySQL table identifier form for a table definition for `INSERT` statements."
  [driver dbdeffable tabledeffable]
  (let [dbdef    (->dbdef dbdeffable)
        tabledef (->tabledef dbdef tabledeffable)]
    (#'sql-jdbc.load-data/table-identifier driver dbdef tabledef)))

(defn reducible-jdbc-insert-rows-dml-statements
  "Reducible sequence of `INSERT` statements generated from a table definition for `driver`."
  [driver dbdeffable tabledeffable]
  (let [dbdef            (->dbdef dbdeffable)
        tabledef         (->tabledef dbdef tabledeffable)
        table-identifier (table-identifier driver dbdef tabledef)]
    (eduction
     (mapcat (fn [rows]
               (ddl/insert-rows-dml-statements driver table-identifier rows)))
     (jdbc-reducible-chunks driver dbdef tabledef))))

(defn jdbc-insert-rows-dml-statements
  "Generate the `INSERT` statements for a table definition for `driver`."
  [driver dbdeffable tabledeffable]
  (into [] (reducible-jdbc-insert-rows-dml-statements driver dbdeffable tabledeffable)))

(defn db
  "Like [[metabase.test/db]] but takes `driver` and optionally `dbdeffable` as parameters for ease of use from the REPL without using [[metabase.driver/with-driver]]` or [[metabase.test/dataset]].
  Forces loading of test data and/or Database creation as side-effects.

    (db :redshift 'test-data)"
  ([driver]
   (db driver 'test-data))

  ([driver dbdeffable]
   (driver/with-driver driver
     (data.impl/do-with-dataset
      (->dbdef dbdeffable)
      mt/db))))
