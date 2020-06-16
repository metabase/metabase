(ns metabase.test.data.sql-jdbc.load-data
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [spec :as spec]]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.util.honeysql-extensions :as hx])
  (:import java.sql.SQLException))

(defmulti load-data!
  "Load the rows for a specific table into a DB. `load-data-chunked!` is the default implementation (see below); several
  other implementations like `load-data-all-at-once!` and `load-data-one-at-a-time!` are already defined; see below.
  It will likely take some experimentation to see which implementation works correctly and performs best with your
  driver."
  {:arglists '([driver dbdef tabledef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti do-insert!
  "Low-level method used internally by `load-data!`. Insert `row-or-rows` into table with `table-identifier`.

  You usually do not need to override this, and can instead use a different implementation of `load-data!`. You can
  also override `ddl/insert-rows-honeysql-form` or `ddl/insert-rows-ddl-statements` instead if you only need to change
  DDL statement(s) themselves, rather than how they are executed."
  {:arglists '([driver, spec, ^metabase.util.honeysql_extensions.Identifier table-identifier, row-or-rows])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Loading Data                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; Loading Table Data

;; Since different DBs have constraints on how we can do this, the logic is broken out into a few different functions
;; you can compose together a driver that works with a given DB.
;;
;; (ex. SQL Server has a low limit on how many ? args we can have in a prepared statement, so it needs to be broken
;;  out into chunks; Oracle doesn't understand the normal syntax for inserting multiple rows at a time so we'll insert
;;  them one-at-a-time instead)


;;; ------------------------------------ make-load-data-fn! middleware functions -------------------------------------

;; These functions ultimately get composed together with a call to `comp` and work in a middleware pattern. Each
;; function takes one arg, an `insert!` function which ultimately performs the INSERTing or rows, and should return a
;; one-arg function that accepts a sequence of `rows` (as maps). These middleware functions can modify rows as
;; appropriate before inserting them (such as adding IDs) or insert them in smaller chunks (or even one at a time) by
;; calling `insert!` multiple times. (`insert!` accepts either a sequence of rows or one row at a time.)
;;
;; `insert!`  -->  <middleware function>  -->  (fn [rows] (insert! rows))

(defn- add-ids
  "Add an `:id` column to each row in `rows`, for databases that should have data inserted with the ID explicitly
  specified. (This isn't meant for composition with `load-data-get-rows`; "
  [rows]
  (for [[i row] (m/indexed rows)]
    (into {:id (inc i)} row)))

(defn load-data-add-ids
  "Middleware function intended for use with `make-load-data-fn`. Add IDs to each row, presumabily for doing a parallel
  insert. This function should go before `load-data-chunked` or `load-data-one-at-a-time` in the `make-load-data-fn`
  args."
  [insert!]
  (fn [rows]
    (insert! (vec (add-ids rows)))))

(defn load-data-chunked
  "Middleware function intended for use with `make-load-data-fn`. Insert rows in chunks, which default to 200 rows
  each."
  ([insert!]                   (load-data-chunked map insert!))
  ([map-fn insert!]            (load-data-chunked map-fn 200 insert!))
  ([map-fn chunk-size insert!] (fn [rows]
                                 (dorun (map-fn insert! (partition-all chunk-size rows))))))

(defn load-data-one-at-a-time
  "Middleware function intended for use with `make-load-data-fn`. Insert rows one at a time."
  ([insert!]        (load-data-one-at-a-time map insert!))
  ([map-fn insert!] (fn [rows]
                      (dorun (map-fn insert! rows)))))


;;; -------------------------------- Making a load-data! impl with make-load-data-fn ---------------------------------

(defn load-data-get-rows
  "Used by `make-load-data-fn`; get a sequence of row maps for use in a `insert!` when loading table data."
  [driver dbdef tabledef]
  (let [fields-for-insert (mapv (comp keyword :field-name)
                                (:field-definitions tabledef))]
    ;; TIMEZONE FIXME
    (for [row (:rows tabledef)]
      (zipmap fields-for-insert row))))

(defn- make-insert!
  "Used by `make-load-data-fn`; creates the actual `insert!` function that gets passed to the `insert-middleware-fns`
  described above."
  [driver conn {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
  (let [components       (for [component (sql.tx/qualified-name-components driver database-name table-name)]
                           (tx/format-name driver (u/qualified-name component)))
        table-identifier (sql.qp/->honeysql driver (apply hx/identifier :table components))]
    (partial do-insert! driver conn table-identifier)))

(defn make-load-data-fn
  "Create an implementation of `load-data!`. This creates a function to actually insert a row or rows, wraps it with any
  `insert-middleware-fns`, the calls the resulting function with the rows to insert."
  [& insert-middleware-fns]
  (let [insert-middleware (apply comp insert-middleware-fns)]
    (fn [driver dbdef tabledef]
      (jdbc/with-db-connection [conn (spec/dbdef->spec driver :db dbdef)]
        (.setAutoCommit (jdbc/get-connection conn) false)
        (let [insert! (insert-middleware (make-insert! driver conn dbdef tabledef))
              rows    (load-data-get-rows driver dbdef tabledef)]
          (log/tracef "Inserting rows like: %s" (first rows))
          (insert! rows))))))


;;; ------------------------------------------ Predefinied load-data! impls ------------------------------------------

;; You can use one of these alternative implementations instead of `load-data-chunked!` if that doesn't work with your
;; DB or one of these other ones performs faster

(def load-data-all-at-once!
  "Implementation of `load-data!`. Insert all rows at once."
  (make-load-data-fn))

(def load-data-chunked!
  "Implementation of `load-data!`. Insert rows in chunks of 200 at a time."
  (make-load-data-fn load-data-chunked))

(def load-data-one-at-a-time!
  "Implementation of `load-data!`. Insert rows one at a time."
  (make-load-data-fn load-data-one-at-a-time))

(def load-data-add-ids!
  "Implementation of `load-data!`. Insert all rows at once; add IDs."
  (make-load-data-fn load-data-add-ids))

(def load-data-one-at-a-time-add-ids!
  "Implementation of `load-data!` that inserts rows one at a time, but adds IDs."
  (make-load-data-fn load-data-add-ids load-data-one-at-a-time))

(def load-data-chunked-parallel!
  "Implementation of `load-data!`. Insert rows in chunks of 200 at a time, in parallel."
  (make-load-data-fn load-data-add-ids (partial load-data-chunked pmap)))

(def load-data-one-at-a-time-parallel!
  "Implementation of `load-data!`. Insert rows one at a time, in parallel."
  (make-load-data-fn load-data-add-ids (partial load-data-one-at-a-time pmap)))
;; ^ the parallel versions aren't neccesarily faster than the sequential versions for all drivers so make sure to do
;; some profiling in order to pick the appropriate implementation

;; Default impl

(defmethod load-data! :sql-jdbc/test-extensions [driver dbdef tabledef]
  (load-data-chunked! driver dbdef tabledef))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              CREATING DBS/TABLES                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;; default impl
(defmethod do-insert! :sql-jdbc/test-extensions
  [driver spec table-identifier row-or-rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier row-or-rows)]
    ;; `set-parameters` might try to look at DB timezone; we don't want to do that while loading the data because the
    ;; DB hasn't been synced yet
    (when-let [set-timezone-format-string (sql-jdbc.execute/set-timezone-sql driver)]
      (let [set-timezone-sql (format set-timezone-format-string "'UTC'")]
        (log/debugf "Setting timezone to UTC before inserting data with SQL \"%s\"" set-timezone-sql)
        (jdbc/execute! spec [set-timezone-sql])))
    (mt/with-database-timezone-id nil
      (try
        ;; TODO - why don't we use `execute/execute-sql!` here like we do below?
        (doseq [sql+args statements]
          (log/tracef "[insert] %s" (pr-str sql+args))
          (jdbc/execute! spec sql+args {:set-parameters (fn [stmt params]
                                                          (sql-jdbc.execute/set-parameters! driver stmt params))}))
        (catch SQLException e
          (println (u/format-color 'red "INSERT FAILED: \n%s\n" statements))
          (jdbc/print-sql-exception-chain e)
          (throw e))))))

(defn create-db!
  "Default implementation of `create-db!` for SQL drivers."
  {:arglists '([driver dbdef & {:keys [skip-drop-db?]}])}
  [driver {:keys [table-definitions], :as dbdef} & options]
  ;; first execute statements to drop/create the DB if needed (this will return nothing is `skip-drop-db?` is true)
  (doseq [statement (apply ddl/drop-db-ddl-statements driver dbdef options)]
    (execute/execute-sql! driver :server dbdef statement))
  ;; next, get a set of statements for creating the DB & Tables
  (let [statements (apply ddl/create-db-ddl-statements driver dbdef options)]
    ;; exec the combined statement
    (execute/execute-sql! driver :db dbdef (str/join ";\n" statements)))
  ;; Now load the data for each Table
  (doseq [tabledef table-definitions]
    (u/profile (format "load-data for %s %s %s" (name driver) (:database-name dbdef) (:table-name tabledef))
      (load-data! driver dbdef tabledef))))

(defn destroy-db!
  "Default impl of `destroy-db!` for SQL drivers."
  [driver dbdef]
  (doseq [statement (apply ddl/drop-db-ddl-statements driver dbdef)]
    (execute/execute-sql! driver :server dbdef statement)))
