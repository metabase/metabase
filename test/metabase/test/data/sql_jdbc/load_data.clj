(ns metabase.test.data.sql-jdbc.load-data
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.tools.reader.edn :as edn]
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.spec :as spec]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmulti load-data!
  "Load the rows for a specific table (which has already been created) into a DB. `load-data-chunked!` is the default
  implementation (see below); several other implementations like `load-data-all-at-once!` are already defined; see
  below. It will likely take some experimentation to see which implementation works correctly and performs best with
  your driver."
  {:arglists '([driver dbdef tabledef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti do-insert!
  "Low-level method used internally by `load-data!`. Insert `row-or-rows` into table with `table-identifier`.

  You usually do not need to override this, and can instead use a different implementation of `load-data!`. You can
  also override `ddl/insert-rows-honeysql-form` or `ddl/insert-rows-ddl-statements` instead if you only need to change
  DDL statement(s) themselves, rather than how they are executed."
  {:arglists '([driver spec table-identifier row-or-rows])}
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
  insert. This function should go before `load-data-chunked` in the `make-load-data-fn`
  args."
  [insert!]
  (fn [rows]
    (insert! (vec (add-ids rows)))))

(def ^:dynamic *chunk-size*
  "Default chunk size for [[load-data-chunked]]."
  200)

(defn load-data-chunked
  "Middleware function intended for use with [[make-load-data-fn]]. Insert rows in chunks, which default to 200 rows
  each. You can use [[*chunk-size*]] to adjust this."
  ([insert!]                   (load-data-chunked map insert!))
  ([map-fn insert!]            (load-data-chunked map-fn *chunk-size* insert!))
  ([map-fn chunk-size insert!] (fn [rows]
                                 (dorun (map-fn insert! (partition-all chunk-size rows))))))


;;; -------------------------------- Making a load-data! impl with make-load-data-fn ---------------------------------

(defn load-data-get-rows
  "Used by `make-load-data-fn`; get a sequence of row maps for use in a `insert!` when loading table data."
  [_driver _dbdef tabledef]
  (let [fields-for-insert (mapv (comp keyword :field-name)
                                (:field-definitions tabledef))]
    ;; TIMEZONE FIXME
    (for [row (:rows tabledef)]
      (zipmap fields-for-insert row))))

(defn- make-insert!
  "Used by `make-load-data-fn`; creates the actual `insert!` function that gets passed to the `insert-middleware-fns`
  described above."
  [driver spec {:keys [database-name], :as _dbdef} {:keys [table-name], :as _tabledef}]
  (let [components       (for [component (sql.tx/qualified-name-components driver database-name table-name)]
                           (ddl.i/format-name driver (u/qualified-name component)))
        table-identifier (sql.qp/->honeysql driver (apply h2x/identifier :table components))]
    (partial do-insert! driver spec table-identifier)))

(defn make-load-data-fn
  "Create an implementation of `load-data!`. This creates a function to actually insert a row or rows, wraps it with any
  `insert-middleware-fns`, the calls the resulting function with the rows to insert."
  [& insert-middleware-fns]
  (let [insert-middleware (apply comp insert-middleware-fns)]
    (fn [driver dbdef tabledef]
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       (spec/dbdef->spec driver :db dbdef)
       {:write? true}
       (fn [^java.sql.Connection conn]
         (.setAutoCommit conn false)
         (let [insert! (insert-middleware (make-insert! driver {:connection conn} dbdef tabledef))
               rows    (load-data-get-rows driver dbdef tabledef)]
           (log/tracef "Inserting rows like: %s" (first rows))
           (insert! rows)))))))


;;; ------------------------------------------ Predefinied load-data! impls ------------------------------------------

;; You can use one of these alternative implementations instead of `load-data-chunked!` if that doesn't work with your
;; DB or one of these other ones performs faster

(def ^{:arglists '([driver dbdef tabledef])} load-data-all-at-once!
  "Implementation of `load-data!`. Insert all rows at once."
  (make-load-data-fn))

(def ^{:arglists '([driver dbdef tabledef])} load-data-chunked!
  "Implementation of `load-data!`. Insert rows in chunks of [[*chunk-size*]] (default 200) at a time."
  (make-load-data-fn load-data-chunked))

(defn load-data-maybe-add-ids!
  "Implementation of `load-data!`. Insert all rows at once;
  Add IDs if tabledef does not contains PK."
  [driver dbdef tabledef]
  (let [load-data! (if-not (some :pk? (:field-definitions tabledef))
                    (make-load-data-fn load-data-add-ids)
                    (make-load-data-fn load-data-chunked))]
    (load-data! driver dbdef tabledef)))

(defn load-data-maybe-add-ids-chunked!
  "Implementation of `load-data!`. Insert rows in chunks of [[*chunk-size*]] (default 200) at a time;
  Add IDs if tabledef does not contains PK."
  [driver dbdef tabledef]
  (let [load-data! (if-not (some :pk? (:field-definitions tabledef))
                    (make-load-data-fn load-data-add-ids load-data-chunked)
                    (make-load-data-fn load-data-chunked))]
    (load-data! driver dbdef tabledef)))

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
    (when-let [set-timezone-format-string #_{:clj-kondo/ignore [:deprecated-var]} (sql-jdbc.execute/set-timezone-sql driver)]
      (let [set-timezone-sql (format set-timezone-format-string "'UTC'")]
        (log/debugf "Setting timezone to UTC before inserting data with SQL \"%s\"" set-timezone-sql)
        (jdbc/execute! spec [set-timezone-sql])))
    (mt/with-database-timezone-id nil
      (doseq [sql-args statements
              :let     [sql-args (if (string? sql-args)
                                   [sql-args]
                                   sql-args)]]
        (assert (string? (first sql-args))
                (format "Bad sql-args: %s" (pr-str sql-args)))
        (log/tracef "[insert] %s" (pr-str sql-args))
        (try
          ;; TODO - why don't we use [[execute/execute-sql!]] here like we do below?
          ;; Tech Debt Issue: #39375
          (jdbc/execute! spec sql-args {:set-parameters (fn [stmt params]
                                                          (sql-jdbc.execute/set-parameters! driver stmt params))})
          (catch Throwable e
            (throw (ex-info (format "INSERT FAILED: %s" (ex-message e))
                            {:driver   driver
                             :sql-args (into [(str/split-lines (mdb.query/format-sql (first sql-args)))]
                                             (rest sql-args))}
                            e))))))))

(defonce ^:private reference-load-durations
  (delay (edn/read-string (slurp "test_resources/load-durations.edn"))))

(defn create-db!
  "Default implementation of `create-db!` for SQL drivers."
  {:arglists '([driver dbdef & {:keys [skip-drop-db?]}])}
  [driver {:keys [table-definitions] :as dbdef} & options]
  ;; first execute statements to drop the DB if needed (this will do nothing if `skip-drop-db?` is true)
  (doseq [statement (apply ddl/drop-db-ddl-statements driver dbdef options)]
    (execute/execute-sql! driver :server dbdef statement))
  ;; now execute statements to create the DB
  (doseq [statement (ddl/create-db-ddl-statements driver dbdef)]
    (execute/execute-sql! driver :server dbdef statement))
  ;; next, get a set of statements for creating the tables
  (let [statements (apply ddl/create-db-tables-ddl-statements driver dbdef options)]
    ;; exec the combined statement. Notice we're now executing in the `:db` context e.g. executing them for a specific
    ;; DB rather than on `:server` (no DB in particular)
    (execute/execute-sql! driver :db dbdef (str/join ";\n" statements)))
  ;; Now load the data for each Table
  (doseq [tabledef table-definitions
          :let     [reference-duration (or (some-> (get @reference-load-durations [(:database-name dbdef) (:table-name tabledef)])
                                                   u/format-nanoseconds)
                                           "NONE")]]
    (u/profile (format "load-data for %s %s %s (reference H2 duration: %s)"
                       (name driver) (:database-name dbdef) (:table-name tabledef) reference-duration)
               (try
                (load-data! driver dbdef tabledef)
                (catch Throwable e
                  (throw (ex-info (format "Error loading data: %s" (ex-message e))
                                  {:driver driver, :tabledef (update tabledef :rows (fn [rows]
                                                                                      (concat (take 10 rows) ['...])))}
                                  e)))))))

(defn destroy-db!
  "Default impl of [[metabase.test.data.interface/destroy-db!]] for SQL drivers."
  [driver dbdef]
  (try
    (doseq [statement (ddl/drop-db-ddl-statements driver dbdef)]
      (execute/execute-sql! driver :server dbdef statement))
    (catch Throwable e
      (throw (ex-info "Error destroying database"
                      {:driver driver, :dbdef dbdef}
                      e)))))
