(ns metabase.test.data.generic-sql
  "Common functionality for various Generic SQL dataset loaders."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            (korma [core :as k]
                   [db :as kdb])
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            (metabase.test.data [datasets :as datasets]
                                [interface :as i])
            [metabase.util :as u])
  (:import clojure.lang.Keyword
           (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

;;; ## ------------------------------------------------------------ IGenericDatasetLoader + default impls ------------------------------------------------------------

(defprotocol IGenericSQLDatasetLoader
  "Methods for loading `DatabaseDefinition` in a SQL database.
   A type that implements `IGenericSQLDatasetLoader` can be made to implement most of `IDatasetLoader`
   by using the `IDatasetLoaderMixin`.

   Methods marked *Optional* below have a default implementation specified in `DefaultsMixin`."
  (field-base-type->sql-type [this ^Keyword base-type]
    "Return a native SQL type that should be used for fields of BASE-TYPE.")

  (pk-sql-type ^String [this]
    "SQL type of a primary key field.")

  ;; *Optional* SQL Statements
  (create-db-sql ^String [this ^DatabaseDefinition dbdef]
    "*Optional* Return a `CREATE DATABASE` statement.")

  (drop-db-if-exists-sql ^String [this ^DatabaseDefinition dbdef]
    "*Optional* Return a `DROP DATABASE` statement.")

  (create-table-sql ^String [this ^DatabaseDefinition dbdef, ^TableDefinition tabledef]
    "*Optional* Return a `CREATE TABLE` statement.")

  (drop-table-if-exists-sql ^String [this ^DatabaseDefinition dbdef, ^TableDefinition tabledef]
     "*Optional* Return a `DROP TABLE IF EXISTS` statement.")

  (add-fk-sql ^String [this ^DatabaseDefinition dbdef, ^TableDefinition tabledef, ^FieldDefinition fielddef]
    "*Optional* Return a `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` statement.")

  ;; Other optional methods
  (korma-entity [this ^DatabaseDefinition dbdef, ^TableDefinition tabledef]
    "*Optional* Return a korma-entity for TABLEDEF.")

  (pk-field-name ^String [this]
    "*Optional* Name of a PK field. Defaults to `\"id\"`.")

  (qualified-name-components [this ^String database-name]
                             [this ^String database-name, ^String table-name]
                             [this ^String database-name, ^String table-name, ^String field-name]
    "*Optional*. Return a vector of String names that can be used to refer to a database, table, or field.
     This is provided so loaders have the opportunity to inject things like schema names or even modify the names themselves.

       (qualified-name-components [loader \"my-db\" \"my-table\"]) -> [\"my-db\" \"dbo\" \"my-table\"]

     By default, this qualifies field names with their table name, but otherwise does no other specific qualification.")

  (quote-name ^String [this ^String nm]
    "*Optional*. Quote a name. Defaults to using double quotes.")

  (qualify+quote-name ^String [this ^String database-name]
                      ^String [this ^String database-name, ^String table-name]
                      ^String [this ^String database-name, ^String table-name, ^String field-name]
    "*Optional*. Qualify names and combine into a single, quoted name. By default, this combines the results of `qualified-name-components`
     and `quote-name`.

       (qualify+quote-name [loader \"my-db\" \"my-table\"]) -> \"my-db\".\"dbo\".\"my-table\"")

  (database->spec [this ^Keyword context, ^DatabaseDefinition dbdef]
    "*Optional*. Return a JDBC spec that should be used to connect to DBDEF.
     Uses `sql/connection-details->spec` by default.")

  (load-data! [this ^DatabaseDefinition dbdef, ^TableDefinition tabledef]
    "*Optional*. Load the rows for a specific table into a DB.")

  (execute-sql! [loader ^Keyword context, ^DatabaseDefinition dbdef, ^String sql]
    "Execute a string of raw SQL. Context is either `:server` or `:db`."))


(defn- default-create-db-sql [loader {:keys [database-name]}]
  (format "CREATE DATABASE %s;" (qualify+quote-name loader database-name)))

(defn default-drop-db-if-exists-sql [loader {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s;" (qualify+quote-name loader database-name)))

(defn default-create-table-sql [loader {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quot          (partial quote-name loader)
        pk-field-name (quot (pk-field-name loader))]
    (format "CREATE TABLE %s (%s, %s %s, PRIMARY KEY (%s));"
            (qualify+quote-name loader database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quot field-name) (if (map? base-type)
                                                            (:native base-type)
                                                            (field-base-type->sql-type loader base-type)))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (pk-sql-type loader)
            pk-field-name)))

(defn- default-drop-table-if-exists-sql [loader {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s;" (qualify+quote-name loader database-name table-name)))

(defn drop-table-if-exists-cascade-sql
  "Alternate implementation of `drop-table-if-exists-sql` that adds `CASCADE` to the statement for DBs that support it."
  [loader {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s CASCADE;" (qualify+quote-name loader database-name table-name)))

(defn default-add-fk-sql [loader {:keys [database-name]} {:keys [table-name]} {dest-table-name :fk, field-name :field-name}]
  (let [quot            (partial quote-name loader)
        dest-table-name (name dest-table-name)]
    (format "ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s);"
            (qualify+quote-name loader database-name table-name)
            ;; limit FK constraint name to 30 chars since Oracle doesn't support names longer than that
            (quot (apply str (take 30 (format "fk_%s_%s_%s" table-name field-name dest-table-name))))
            (quot field-name)
            (qualify+quote-name loader database-name dest-table-name)
            (quot (pk-field-name loader)))))

(defn- default-qualified-name-components
  ([_ db-name]
   [db-name])
  ([_ db-name table-name]
   [table-name])
  ([_ db-name table-name field-name]
   [table-name field-name]))

(defn- default-quote-name [_ nm]
  (str \" nm \"))

(defn- quote+combine-names [loader names]
  (->> names
       (map (partial quote-name loader))
       (interpose \.)
       (apply str)))

(defn- default-qualify+quote-name
  ([loader db-name]
   (quote+combine-names loader (qualified-name-components loader db-name)))
  ([loader db-name table-name]
   (quote+combine-names loader (qualified-name-components loader db-name table-name)))
  ([loader db-name table-name field-name]
   (quote+combine-names loader (qualified-name-components loader db-name table-name field-name))))

(defn- default-database->spec [loader context dbdef]
  (let [spec (sql/connection-details->spec loader (i/database->connection-details loader context dbdef))]
    (assoc spec :make-pool? (not (:short-lived? spec)))))

(defn default-korma-entity [loader {:keys [database-name], :as dbdef} {:keys [table-name]}]
  (-> (k/create-entity (->> (qualified-name-components loader database-name table-name)
                            (interpose \.) ; we just want a table name like "table-name" or "db-name.dbo.table-name" here
                            (apply str)))  ; korma will split on the periods and re-qualify the individual parts for us
      (k/database (kdb/create-db (database->spec loader :db dbdef)))))

;;; Loading Table Data
;; Since different DBs have constraints on how we can do this, the logic is broken out into a few different functions
;; you can compose together a loader that works with a given DB.
;; (ex. SQL Server has a low limit on how many ? args we can have in a prepared statement, so it needs to be broken out into chunks;
;;  Oracle doesn't understand the normal syntax for inserting multiple rows at a time so we'll insert them one-at-a-time instead)

(defn load-data-get-rows
  "Get a sequence of row maps for use in a korma `insert` when loading table data."
  [loader dbdef tabledef]
  (let [fields-for-insert (mapv (comp keyword :field-name)
                                (:field-definitions tabledef))]
    (for [row (:rows tabledef)]
      (zipmap fields-for-insert (for [v row]
                                  (if (instance? java.util.Date v)
                                    (u/->Timestamp v)
                                    v))))))

(defn load-data-add-ids
  "Add IDs to each row, presumabily for doing a parallel insert. This arg should go before `load-data-chunked` or `load-data-one-at-a-time`."
  [insert!]
  (fn [rows]
    (insert! (pmap (fn [[i row]]
                     (assoc row :id (inc i)))
                   (m/indexed rows)))
    ;; (insert! (vec (for [[i row] (m/indexed rows)]
    ;;                 (assoc row :id (inc i)))))
    ))

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

(defn load-data-with-debug-logging
  "Add debug logging to the data loading fn. This should passed as the first arg to `make-load-data-fn`."
  [insert!]
  (fn [rows]
    (println (u/format-color 'blue "Inserting %d rows like:\n%s" (count rows) (s/replace (k/sql-only (k/insert :some-table (k/values (first rows))))
                                                                                         #"\"SOME-TABLE\""
                                                                                         "[table]")))
    (let [start-time (System/currentTimeMillis)]
      (insert! rows)
      (println (u/format-color 'green "Inserting %d rows took %d ms." (count rows) (- (System/currentTimeMillis) start-time))))))

(defn make-load-data-fn
  "Create a `load-data!` function. This creates a function to actually insert a row or rows, wraps it with any WRAP-INSERT-FNS,
   the calls the resulting function with the rows to insert."
  [& wrap-insert-fns]
  (fn [loader dbdef tabledef]
    (let [entity  (korma-entity loader dbdef tabledef)
          ;; _       (assert (or (delay? (:pool (:db entity)))
          ;;                     (println "Expected pooled connection:" (u/pprint-to-str 'cyan entity))))
          insert! ((apply comp wrap-insert-fns) (fn [row-or-rows]
                                                  ;; (let [id (:id row-or-rows)]
                                                  ;;   (when (zero? (mod id 50))
                                                  ;;     (println id)))
                                                  (k/insert entity (k/values row-or-rows))))
          rows    (load-data-get-rows loader dbdef tabledef)]
      (insert! rows))))

(def load-data-all-at-once!             "Insert all rows at once."                             (make-load-data-fn))
(def load-data-chunked!                 "Insert rows in chunks of 200 at a time."              (make-load-data-fn load-data-chunked))
(def load-data-one-at-a-time!           "Insert rows one at a time."                           (make-load-data-fn load-data-one-at-a-time))
(def load-data-chunked-parallel!        "Insert rows in chunks of 200 at a time, in parallel." (make-load-data-fn load-data-add-ids (partial load-data-chunked pmap)))
(def load-data-one-at-a-time-parallel!  "Insert rows one at a time, in parallel."              (make-load-data-fn load-data-add-ids (partial load-data-one-at-a-time pmap)))


(defn default-execute-sql! [loader context dbdef sql]
  (let [sql (some-> sql s/trim)]
    (when (and (seq sql)
               ;; make sure SQL isn't just semicolons
               (not (s/blank? (s/replace sql #";" ""))))
      ;; Remove excess semicolons, otherwise snippy DBs like Oracle will barf
      (let [sql (s/replace sql #";+" ";")]
        ;; (println (u/format-color 'blue "[SQL] <<<%s>>>" sql))
        (try
          (jdbc/execute! (database->spec loader context dbdef) [sql] :transaction? false, :multi? true)
          (catch java.sql.SQLException e
            (println "Error executing SQL:" sql)
            (println (format "Caught SQLException:\n%s"
                             (with-out-str (jdbc/print-sql-exception-chain e))))
            (throw e))
          (catch Throwable e
            (println "Error executing SQL:" sql)
            (println (format "Caught Exception: %s %s\n%s" (class e) (.getMessage e)
                             (with-out-str (.printStackTrace e))))
            (throw e)))
        ;; (println (u/format-color 'blue "[OK]"))
        ))))


(def DefaultsMixin
  "Default implementations for methods marked *Optional* in `IGenericSQLDatasetLoader`."
  {:add-fk-sql                default-add-fk-sql
   :create-db-sql             default-create-db-sql
   :create-table-sql          default-create-table-sql
   :database->spec            default-database->spec
   :drop-db-if-exists-sql     default-drop-db-if-exists-sql
   :drop-table-if-exists-sql  default-drop-table-if-exists-sql
   :execute-sql!              default-execute-sql!
   :korma-entity              default-korma-entity
   :load-data!                load-data-chunked!
   :pk-field-name             (constantly "id")
   :qualified-name-components default-qualified-name-components
   :qualify+quote-name        default-qualify+quote-name
   :quote-name                default-quote-name})


;; ## ------------------------------------------------------------ IDatasetLoader impl ------------------------------------------------------------

(defn sequentially-execute-sql!
  "Alternative implementation of `execute-sql!` that executes statements one at a time for drivers
   that don't support executing multiple statements at once.

   Since there are some cases were you might want to execute compound statements without splitting, an upside-down ampersand (`⅋`) is understood as an
   \"escaped\" semicolon in the resulting SQL statement."
  [loader context dbdef sql]
  (when sql
    (doseq [statement (map s/trim (s/split sql #";+"))]
      (when (seq statement)
        (default-execute-sql! loader context dbdef (s/replace statement #"⅋" ";"))))))

(defn- create-db! [loader {:keys [table-definitions], :as dbdef}]
  ;; Exec SQL for creating the DB
  (execute-sql! loader :server dbdef (str (drop-db-if-exists-sql loader dbdef) ";\n"
                                          (create-db-sql loader dbdef)))

  ;; Build combined statement for creating tables + FKs
  (let [statements (atom [])]

    ;; Add the SQL for creating each Table
    (doseq [tabledef table-definitions]
      (swap! statements conj (drop-table-if-exists-sql loader dbdef tabledef))
      (swap! statements conj (create-table-sql loader dbdef tabledef)))

    ;; Add the SQL for adding FK constraints
    (doseq [{:keys [field-definitions], :as tabledef} table-definitions]
      (doseq [{:keys [fk], :as fielddef} field-definitions]
        (when fk
          (swap! statements conj (add-fk-sql loader dbdef tabledef fielddef)))))

    ;; exec the combined statement
    (execute-sql! loader :db dbdef (apply str (interpose ";\n" @statements))))

  ;; Now load the data for each Table
  (doseq [tabledef table-definitions]
    (load-data! loader dbdef tabledef)))

(defn- destroy-db! [loader dbdef]
  (execute-sql! loader :server dbdef (drop-db-if-exists-sql loader dbdef)))

(def IDatasetLoaderMixin
  "Mixin for `IGenericSQLDatasetLoader` types to implemnt `create-db!` and `destroy-db!` from `IDatasetLoader`."
  (merge i/IDatasetLoaderDefaultsMixin
         {:create-db!  create-db!
          :destroy-db! destroy-db!}))


;;; ## Various Util Fns

(defn execute-when-testing!
  "Execute a prepared SQL-AND-ARGS against Database with spec returned by GET-CONNECTION-SPEC only when running tests against ENGINE.
   Useful for doing engine-specific setup or teardown."
  [engine get-connection-spec & sql-and-args]
  (datasets/when-testing-engine engine
    (println (u/format-color 'blue "[%s] %s" (name engine) (first sql-and-args)))
    (jdbc/execute! (get-connection-spec) sql-and-args)
    (println (u/format-color 'blue "[OK]"))))
