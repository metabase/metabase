(ns metabase.test.data.generic-sql
  "Common functionality for various Generic SQL dataset drivers."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [honeysql
             [core :as hsql]
             [format :as hformat]
             [helpers :as h]]
            [medley.core :as m]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.test.data.interface :as i]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]])
  (:import clojure.lang.Keyword
           java.sql.SQLException
           [metabase.test.data.interface DatabaseDefinition FieldDefinition TableDefinition]))

;;; ----------------------------------- IGenericSQLTestExtensions + default impls ------------------------------------

(defprotocol IGenericSQLTestExtensions
  "Methods for loading `DatabaseDefinition` in a SQL database.
   A type that implements `IGenericSQLTestExtensions` can be made to implement most of `IDriverTestExtensions`
   by using the `IDriverTestExtensionsMixin`.

   Methods marked *Optional* below have a default implementation specified in `DefaultsMixin`."
  (field-base-type->sql-type [this, ^Keyword base-type]
    "Return a native SQL type that should be used for fields of BASE-TYPE.")

  (pk-sql-type ^String [this]
    "SQL type of a primary key field.")

  ;; *Optional* SQL Statements
  (create-db-sql ^String [this, ^DatabaseDefinition dbdef]
    "*Optional* Return a `CREATE DATABASE` statement.")

  (drop-db-if-exists-sql ^String [this, ^DatabaseDefinition dbdef]
    "*Optional* Return a `DROP DATABASE` statement.")

  (create-table-sql ^String [this, ^DatabaseDefinition dbdef, ^TableDefinition tabledef]
    "*Optional* Return a `CREATE TABLE` statement.")

  (drop-table-if-exists-sql ^String [this, ^DatabaseDefinition dbdef, ^TableDefinition tabledef]
    "*Optional* Return a `DROP TABLE IF EXISTS` statement.")

  (add-fk-sql ^String [this, ^DatabaseDefinition dbdef, ^TableDefinition tabledef, ^FieldDefinition fielddef]
    "*Optional* Return a `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` statement.")

  (inline-column-comment-sql ^String [this, ^String comment]
    "*Optional* Return an inline `COMMENT` statement for a column.")

  (standalone-column-comment-sql ^String [this, ^DatabaseDefinition dbdef, ^TableDefinition tabledef, ^FieldDefinition fielddef]
    "*Optional* Return standalone `COMMENT` statement for a column.")

  (inline-table-comment-sql ^String [this, ^String comment]
    "*Optional* Return an inline `COMMENT` statement for a table.")

  (standalone-table-comment-sql ^String [this, ^DatabaseDefinition dbdef, ^TableDefinition tabledef]
    "*Optional* Return standalone `COMMENT` statement for a table.")

  (prepare-identifier [this, ^String identifier]
    "*OPTIONAL*. Prepare an identifier, such as a Table or Field name, when it is used in a SQL query.
     This is used by drivers like H2 to transform names to upper-case.
     The default implementation is `identity`.")

  (pk-field-name ^String [this]
    "*Optional* Name of a PK field. Defaults to `\"id\"`.")

  ;; TODO - WHAT ABOUT SCHEMA NAME???
  (qualified-name-components [this, ^String database-name]
                             [this, ^String database-name, ^String table-name]
                             [this, ^String database-name, ^String table-name, ^String field-name]
    "*Optional*. Return a vector of String names that can be used to refer to a database, table, or field.
 This is provided so drivers have the opportunity to inject things like schema names or even modify the names
 themselves.

    (qualified-name-components [driver \"my-db\" \"my-table\"]) -> [\"my-db\" \"dbo\" \"my-table\"]

 By default, this qualifies field names with their table name, but otherwise does no other specific
 qualification.")

  ;; TODO - why can't we just use `honeysql.core/format` with the `:quoting` options set to the driver's `quote-style`?
  (quote-name ^String [this, ^String nm]
    "*Optional*. Quote a name. Defaults to using double quotes.")

  (qualify+quote-name ^String [this, ^String database-name]
                      ^String [this, ^String database-name, ^String table-name]
                      ^String [this, ^String database-name, ^String table-name, ^String field-name]
    "*Optional*. Qualify names and combine into a single, quoted name. By default, this combines the results of
     `qualified-name-components`and `quote-name`.

       (qualify+quote-name [driver \"my-db\" \"my-table\"]) -> \"my-db\".\"dbo\".\"my-table\"")

  (database->spec [this, ^Keyword context, ^DatabaseDefinition dbdef]
    "*Optional*. Return a JDBC spec that should be used to connect to DBDEF.
     Uses `sql/connection-details->spec` by default.")

  (load-data! [this, ^DatabaseDefinition dbdef, ^TableDefinition tabledef]
    "*Optional*. Load the rows for a specific table into a DB. `load-data-chunked` is the default implementation.")

  (^{:style/indent 2} execute-sql! [driver ^Keyword context, ^DatabaseDefinition dbdef, ^String sql]
    "*Optional*. Execute a string of raw SQL. Context is either `:server` or `:db`."))


(defn- default-create-db-sql [driver {:keys [database-name]}]
  (format "CREATE DATABASE %s;" (qualify+quote-name driver database-name)))

(defn default-drop-db-if-exists-sql [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s;" (qualify+quote-name driver database-name)))

(defn default-create-table-sql [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions table-comment]}]
  (let [quot          (partial quote-name driver)
        pk-field-name (quot (pk-field-name driver))]
    (format "CREATE TABLE %s (%s, %s %s, PRIMARY KEY (%s)) %s;"
            (qualify+quote-name driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type field-comment]}]
                        (format "%s %s %s"
                                (quot field-name)
                                (if (map? base-type)
                                  (:native base-type)
                                  (field-base-type->sql-type driver base-type))
                                (or (inline-column-comment-sql driver field-comment) ""))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (pk-sql-type driver)
            pk-field-name
            (or (inline-table-comment-sql driver table-comment) ""))))

(defn- default-drop-table-if-exists-sql [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s;" (qualify+quote-name driver database-name table-name)))

(defn drop-table-if-exists-cascade-sql
  "Alternate implementation of `drop-table-if-exists-sql` that adds `CASCADE` to the statement for DBs that support
  it."
  [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s CASCADE;" (qualify+quote-name driver database-name table-name)))

(defn default-add-fk-sql [driver {:keys [database-name]} {:keys [table-name]} {dest-table-name :fk, field-name :field-name}]
  (let [quot            (partial quote-name driver)
        dest-table-name (name dest-table-name)]
    (format "ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s);"
            (qualify+quote-name driver database-name table-name)
            ;; limit FK constraint name to 30 chars since Oracle doesn't support names longer than that
            (quot (apply str (take 30 (format "fk_%s_%s_%s" table-name field-name dest-table-name))))
            (quot field-name)
            (qualify+quote-name driver database-name dest-table-name)
            (quot (pk-field-name driver)))))

(defn standard-inline-column-comment-sql
  "Generic inline COMMENT that driver can mixin if supported."
  [_ field-comment]
  (when (seq field-comment)
    (format "COMMENT '%s'" field-comment)))

(defn standard-standalone-column-comment-sql
  "Generic standalone COMMENT that driver can mixin if supported."
  [driver {:keys [database-name]} {:keys [table-name]} {:keys [field-name field-comment]}]
  (when (seq field-comment)
    (format "COMMENT ON COLUMN %s IS '%s';"
      (qualify+quote-name driver database-name table-name field-name)
      field-comment)))

(defn standard-inline-table-comment-sql
  "Generic inline COMMENT that driver can mixin if supported."
  [_ table-comment]
  (when (seq table-comment)
    (format "COMMENT '%s'" table-comment)))

(defn standard-standalone-table-comment-sql
  "Generic standalone COMMENT that driver can mixin if supported."
  [driver {:keys [database-name]} {:keys [table-name table-comment]}]
  (when (seq table-comment)
    (format "COMMENT ON TABLE %s IS '%s';"
      (qualify+quote-name driver database-name table-name)
      table-comment)))

(defn- default-qualified-name-components
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [table-name])
  ([_ db-name table-name field-name] [table-name field-name]))

(defn- default-quote-name [_ nm]
  (str \" nm \"))

(defn- quote+combine-names [driver names]
  (s/join \. (for [n names]
               (name (hx/qualify-and-escape-dots (quote-name driver n))))))

(defn- default-qualify+quote-name
  ;; TODO - what about schemas?
  ([driver db-name]
   (quote+combine-names driver (qualified-name-components driver db-name)))
  ([driver db-name table-name]
   (quote+combine-names driver (qualified-name-components driver db-name table-name)))
  ([driver db-name table-name field-name]
   (quote+combine-names driver (qualified-name-components driver db-name table-name field-name))))

(defn- default-database->spec [driver context dbdef]
  (sql/connection-details->spec driver (i/database->connection-details driver context dbdef)))


;;; Loading Table Data

;; Since different DBs have constraints on how we can do this, the logic is broken out into a few different functions
;; you can compose together a driver that works with a given DB.
;;
;; (ex. SQL Server has a low limit on how many ? args we can have in a prepared statement, so it needs to be broken
;;  out into chunks; Oracle doesn't understand the normal syntax for inserting multiple rows at a time so we'll insert
;;  them one-at-a-time instead)

(defn load-data-get-rows
  "Get a sequence of row maps for use in a `insert!` when loading table data."
  [driver dbdef tabledef]
  (let [fields-for-insert (mapv (comp keyword :field-name)
                                (:field-definitions tabledef))]
    (for [row (:rows tabledef)]
      (zipmap fields-for-insert (for [v row]
                                  (if (and (not (instance? java.sql.Time v))
                                           (instance? java.util.Date v))
                                    (du/->Timestamp v du/utc)
                                    v))))))

(defn add-ids
  "Add an `:id` column to each row in `rows`, for databases that should have data inserted with the ID explicitly
  specified."
  [rows]
  (for [[i row] (m/indexed rows)]
    (assoc row :id (inc i))))

(defn load-data-add-ids
  "Add IDs to each row, presumabily for doing a parallel insert. This arg should go before `load-data-chunked` or
  `load-data-one-at-a-time`."
  [insert!]
  (fn [rows]
    (insert! (vec (add-ids rows)))))

(defn load-data-chunked
  "Insert rows in chunks, which default to 200 rows each."
  ([insert!]                   (load-data-chunked map insert!))
  ([map-fn insert!]            (load-data-chunked map-fn 200 insert!))
  ([map-fn chunk-size insert!] (fn [rows]
                                 (dorun (map-fn insert! (partition-all chunk-size rows))))))

(defn load-data-one-at-a-time
  "Insert rows one at a time."
  ([insert!]        (load-data-one-at-a-time map insert!))
  ([map-fn insert!] (fn [rows]
                      (dorun (map-fn insert! rows)))))

(defn- escape-field-names
  "Escape the field-name keys in ROW-OR-ROWS."
  [row-or-rows]
  (if (sequential? row-or-rows)
    (map escape-field-names row-or-rows)
    (into {} (for [[k v] row-or-rows]
               {(sql/escape-field-name k) v}))))

(defn- do-insert!
  "Insert ROW-OR-ROWS into TABLE-NAME for the DRIVER database defined by SPEC."
  [driver spec table-name row-or-rows]
  (let [prepare-key (comp keyword (partial prepare-identifier driver) name)
        rows        (if (sequential? row-or-rows)
                      row-or-rows
                      [row-or-rows])
        columns     (keys (first rows))
        values      (for [row rows]
                      (for [value (map row columns)]
                        (sqlqp/->honeysql driver value)))
        hsql-form   (-> (apply h/columns (for [column columns]
                                           (hx/qualify-and-escape-dots (prepare-key column))))
                        (h/insert-into (prepare-key table-name))
                        (h/values values))
        sql+args    (hx/unescape-dots (binding [hformat/*subquery?* false]
                                        (hsql/format hsql-form
                                          :quoting             (sql/quote-style driver)
                                          :allow-dashed-names? true)))]
    (try (jdbc/execute! spec sql+args)
         (catch SQLException e
           (println (u/format-color 'red "INSERT FAILED: \n%s\n" sql+args))
           (jdbc/print-sql-exception-chain e)))))

(defn make-load-data-fn
  "Create a `load-data!` function. This creates a function to actually insert a row or rows, wraps it with any
  WRAP-INSERT-FNS, the calls the resulting function with the rows to insert."
  [& wrap-insert-fns]
  (fn [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
    (jdbc/with-db-connection [conn (database->spec driver :db dbdef)]
      (.setAutoCommit (jdbc/get-connection conn) false)
      (let [table-name (apply hx/qualify-and-escape-dots (qualified-name-components driver database-name table-name))
            insert!    ((apply comp wrap-insert-fns) (partial do-insert! driver conn table-name))
            rows       (load-data-get-rows driver dbdef tabledef)]
        (insert! rows)))))

(def load-data-all-at-once!            "Insert all rows at once."                             (make-load-data-fn))
(def load-data-chunked!                "Insert rows in chunks of 200 at a time."              (make-load-data-fn load-data-chunked))
(def load-data-one-at-a-time!          "Insert rows one at a time."                           (make-load-data-fn load-data-one-at-a-time))
(def load-data-add-ids!                "Insert all rows at once; add IDs."                    (make-load-data-fn load-data-add-ids))
(def load-data-chunked-parallel!       "Insert rows in chunks of 200 at a time, in parallel." (make-load-data-fn load-data-add-ids (partial load-data-chunked pmap)))
(def load-data-one-at-a-time-parallel! "Insert rows one at a time, in parallel."              (make-load-data-fn load-data-add-ids (partial load-data-one-at-a-time pmap)))
;; ^ the parallel versions aren't neccesarily faster than the sequential versions for all drivers so make sure to do some profiling in order to pick the appropriate implementation

(defn- jdbc-execute! [db-spec sql]
  (jdbc/execute! db-spec [sql] {:transaction? false, :multi? true}))

(defn default-execute-sql! [driver context dbdef sql & {:keys [execute!]
                                                        :or   {execute! jdbc-execute!}}]
  (let [sql (some-> sql s/trim)]
    (when (and (seq sql)
               ;; make sure SQL isn't just semicolons
               (not (s/blank? (s/replace sql #";" ""))))
      ;; Remove excess semicolons, otherwise snippy DBs like Oracle will barf
      (let [sql (s/replace sql #";+" ";")]
        (try
          (execute! (database->spec driver context dbdef) sql)
          (catch SQLException e
            (println "Error executing SQL:" sql)
            (printf "Caught SQLException:\n%s\n"
                    (with-out-str (jdbc/print-sql-exception-chain e)))
            (throw e))
          (catch Throwable e
            (println "Error executing SQL:" sql)
            (printf "Caught Exception: %s %s\n%s\n" (class e) (.getMessage e)
                    (with-out-str (.printStackTrace e)))
            (throw e)))))))

(def DefaultsMixin
  "Default implementations for methods marked *Optional* in `IGenericSQLTestExtensions`."
  {:add-fk-sql                    default-add-fk-sql
   :inline-column-comment-sql     (constantly nil)
   :standalone-column-comment-sql (constantly nil)
   :inline-table-comment-sql      (constantly nil)
   :standalone-table-comment-sql  (constantly nil)
   :create-db-sql                 default-create-db-sql
   :create-table-sql              default-create-table-sql
   :database->spec                default-database->spec
   :drop-db-if-exists-sql         default-drop-db-if-exists-sql
   :drop-table-if-exists-sql      default-drop-table-if-exists-sql
   :execute-sql!                  default-execute-sql!
   :load-data!                    load-data-chunked!
   :pk-field-name                 (constantly "id")
   :prepare-identifier            (u/drop-first-arg identity)
   :qualified-name-components     default-qualified-name-components
   :qualify+quote-name            default-qualify+quote-name
   :quote-name                    default-quote-name})


;;; ------------------------------------------- IDriverTestExtensions impl -------------------------------------------

(defn sequentially-execute-sql!
  "Alternative implementation of `execute-sql!` that executes statements one at a time for drivers
  that don't support executing multiple statements at once.

  Since there are some cases were you might want to execute compound statements without splitting, an upside-down
  ampersand (`⅋`) is understood as an \"escaped\" semicolon in the resulting SQL statement."
  [driver context dbdef sql  & {:keys [execute!] :or {execute! default-execute-sql!}}]
  (when sql
    (doseq [statement (map s/trim (s/split sql #";+"))]
      (when (seq statement)
        (execute! driver context dbdef (s/replace statement #"⅋" ";"))))))

(defn default-create-db!
  "Default implementation of `create-db!` for SQL drivers."
  ([driver db-def]
   (default-create-db! driver db-def nil))
  ([driver {:keys [table-definitions], :as dbdef} {:keys [skip-drop-db?]
                                                   :or   {skip-drop-db? false}}]
   (when-not skip-drop-db?
     ;; Exec SQL for creating the DB
     (execute-sql! driver :server dbdef (str (drop-db-if-exists-sql driver dbdef) ";\n"
                                             (create-db-sql driver dbdef))))
   ;; Build combined statement for creating tables + FKs + comments
   (let [statements (atom [])]
     ;; Add the SQL for creating each Table
     (doseq [tabledef table-definitions]
       (swap! statements conj (drop-table-if-exists-sql driver dbdef tabledef)
              (create-table-sql driver dbdef tabledef)))

     ;; Add the SQL for adding FK constraints
     (doseq [{:keys [field-definitions], :as tabledef} table-definitions]
       (doseq [{:keys [fk], :as fielddef} field-definitions]
         (when fk
           (swap! statements conj (add-fk-sql driver dbdef tabledef fielddef)))))
     ;; Add the SQL for adding table comments
     (doseq [{:keys [table-comment], :as tabledef} table-definitions]
       (when table-comment
         (swap! statements conj (standalone-table-comment-sql driver dbdef tabledef))))
     ;; Add the SQL for adding column comments
     (doseq [{:keys [field-definitions], :as tabledef} table-definitions]
       (doseq [{:keys [field-comment], :as fielddef} field-definitions]
         (when field-comment
           (swap! statements conj (standalone-column-comment-sql driver dbdef tabledef fielddef)))))
     ;; exec the combined statement
     (execute-sql! driver :db dbdef (s/join ";\n" (map hx/unescape-dots @statements))))
   ;; Now load the data for each Table
   (doseq [tabledef table-definitions]
     (du/profile (format "load-data for %s %s %s" (name driver) (:database-name dbdef) (:table-name tabledef))
       (load-data! driver dbdef tabledef)))))


(def IDriverTestExtensionsMixin
  "Mixin for `IGenericSQLTestExtensions` types to implement `create-db!` from `IDriverTestExtensions`."
  (merge i/IDriverTestExtensionsDefaultsMixin
         {:create-db! default-create-db!}))


;;; ## Various Util Fns

(defn- do-when-testing-engine {:style/indent 1} [engine f]
  (require 'metabase.test.data.datasets)
  ((resolve 'metabase.test.data.datasets/do-when-testing-engine) engine f))

(defn execute-when-testing!
  "Execute a prepared SQL-AND-ARGS against Database with spec returned by GET-CONNECTION-SPEC only when running tests
  against ENGINE. Useful for doing engine-specific setup or teardown."
  {:style/indent 2}
  [engine get-connection-spec & sql-and-args]
  (do-when-testing-engine engine
    (fn []
      (println (u/format-color 'blue "[%s] %s" (name engine) (first sql-and-args)))
      (jdbc/execute! (get-connection-spec) sql-and-args)
      (println (u/format-color 'blue "[OK]")))))

(defn query-when-testing!
  "Execute a prepared SQL-AND-ARGS **query** against Database with spec returned by GET-CONNECTION-SPEC only when
  running tests against ENGINE. Useful for doing engine-specific setup or teardown where `execute-when-testing!` won't
  work because the query returns results."
  {:style/indent 2}
  [engine get-connection-spec & sql-and-args]
  (do-when-testing-engine engine
    (fn []
      (println (u/format-color 'blue "[%s] %s" (name engine) (first sql-and-args)))
      (u/prog1 (jdbc/query (get-connection-spec) sql-and-args)
        (println (u/format-color 'blue "[OK] -> %s" (vec <>)))))))
