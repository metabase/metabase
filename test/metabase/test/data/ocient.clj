(ns metabase.test.data.ocient
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.reader.edn :as edn]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql-jdbc.sync.common :as common]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.driver.sql.util :as sql.u]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.impl :as tx.impl]
            [metabase.test.data.sql :as sql.tx]
            [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
            [metabase.test.data.sql-jdbc.execute :as execute]
            [metabase.test.data.sql-jdbc.load-data :as load-data]
            [metabase.test.data.sql-jdbc.spec :as spec]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx])
  (:import java.sql.SQLException
           [java.sql Connection ResultSet]))

(sql-jdbc.tx/add-test-extensions! :ocient)

;; Use the public schema for all tables
(defonce session-schema (str "public"))

;; Additional columns required by the Ocient database 
(defonce id-column-key (str "id"))

;; Define the primary key type
(defmethod sql.tx/pk-sql-type :ocient [_] "INT NOT NULL")

;; Ocient sorts NULLs last
(defmethod tx/sorts-nil-first? :ocient [_ _] false)

;; Lowercase and replace hyphens/spaces with underscores
(defmethod ddl.i/format-name :ocient
  [_ s]
  (str/replace (str/lower-case s) #"-| " "_"))

(defmethod sql.tx/qualified-name-components :ocient [& args]
  (apply tx/single-db-qualified-name-components session-schema args))

(defonce ^:private reference-load-durations
  (delay (edn/read-string (slurp "test_resources/load-durations.edn"))))

(def ^:private db-connection-details
  (delay
   {:host     (tx/db-test-env-var :ocient :host "tableau-sim.corp.ocient.com")
    :port     (tx/db-test-env-var :ocient :port "7050")
    :user     (tx/db-test-env-var :ocient :user "admin@system")
    :password (tx/db-test-env-var :ocient :password "admin")
    :additional-options "loglevel=TRACE;logfile=/tmp/ocient_jdbc.log;pooling=OFF"}))

(defmethod tx/dbdef->connection-details :ocient
  [driver context {:keys [database-name]}]
  (merge @db-connection-details
         (when (= context :server)
           {:db "system"})
         (when (= context :db)
           {:db (ddl.i/format-name driver database-name)})))

(doseq [[base-type db-type] {:type/BigInteger             "BIGINT"
                             :type/Boolean                "BOOL"
                             :type/Date                   "DATE"
                             :type/DateTime               "TIMESTAMP"
                             :type/Decimal                "DECIMAL(16, 4)"
                             :type/Float                  "DOUBLE"
                             :type/Integer                "INT"
                             :type/IPAddress              "IPV4"
                             :type/*                      "VARCHAR(255)"
                             :type/Text                   "VARCHAR(255)"
                             :type/Time                   "TIME"
                             :type/UUID                   "UUID"}]
  (defmethod sql.tx/field-base-type->sql-type [:ocient base-type] [_ _] db-type))

;; The Ocient JDBC driver barfs when trailing semicolons are tacked onto SQL statments
(defn- execute-sql-spec!
  [spec sql & {:keys [execute!]
               :or   {execute! jdbc/execute!}}]
  (log/tracef (format "[ocient-execute-sql] %s" (pr-str sql)))
  (let [sql (some-> sql str/trim)]
    (try
      (execute! spec sql)
      (catch SQLException e
        (println "Error executing SQL:" sql)
        (printf "Caught SQLException:\n%s\n"
                (with-out-str (jdbc/print-sql-exception-chain e)))
        (throw e))
      (catch Throwable e
        (println "Error executing SQL:" sql)
        (printf "Caught Exception: %s %s\n%s\n" (class e) (.getMessage e)
                (with-out-str (.printStackTrace e)))
        (throw e)))))

(defn- execute-sql!
  [driver context dbdef sql & options]
  (execute-sql-spec! (spec/dbdef->spec driver context dbdef) sql))

(defmethod execute/execute-sql! :ocient [driver context defdef sql]
  (execute-sql! driver context defdef sql))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;                        ;;
;; FOREIGN KEY MANAGEMENT ;;
;;                        ;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Defines the Primary Key used for each table
(defmethod sql.tx/pk-field-name :ocient [_] id-column-key)

(defonce fks-table-name-suffix (str "fks"))
(defonce fks-table-field-name (str "field"))
(defonce fks-table-dest-table-name (str "dest"))

(defn- fks-table-name
  [table-name]
  (str table-name \- fks-table-name-suffix))

;; Creates the FKs table in the database
(defn- create-fks-table-sql
  [database-name table-name]
  (str/join "\n"
            (list
             (format "CREATE TABLE %s (" (sql.tx/qualify-and-quote :ocient database-name (fks-table-name table-name))),
             (format "  %s INT NOT NULL," id-column-key),
             (format "  %s VARCHAR(255) NOT NULL," fks-table-field-name),
             (format "  %s VARCHAR(255) NOT NULL," fks-table-dest-table-name),
             (format "  CLUSTERING INDEX idx01 (%s)" id-column-key),
             ") AS SELECT 0, NULL, NULL LIMIT 0")))

;; Drops the FKs table
(defn- drop-fks-table-sql
  [database-name table-name]
  (format "DROP TABLE IF EXISTS %s" (sql.tx/qualify-and-quote :ocient database-name (fks-table-name table-name))))

(defn- add-fk-sql
  [{:keys [database-name]} {:keys [table-name]} {dest-table-name :fk, field-name :field-name} id]
  (format "INSERT INTO %s SELECT %s, '%s', '%s'"
          (sql.tx/qualify-and-quote :ocient database-name (fks-table-name table-name))
          id
          field-name
          (name dest-table-name)))

;; Ocient does not support foreign keys, but this is needed to enable some of the join functionality
(defmethod sql.tx/add-fk-sql :ocient
  [_ dbdef tabledef fielddef]
  (add-fk-sql dbdef tabledef fielddef 0))


;; Returns the FK mappings for the table
(defn- describe-table-fks*
  [^Connection conn {^String table-name :name}]
  (when (not (str/ends-with? table-name fks-table-name-suffix))
    (let [fks-table-name (str/join "-" [table-name fks-table-name-suffix])
          [sql & params] (hsql/format {:select [[(keyword fks-table-field-name) (keyword fks-table-field-name)]
                                                [(keyword fks-table-dest-table-name) (keyword fks-table-dest-table-name)]]
                                       :from   [(keyword (str session-schema \. (ddl.i/format-name :ocient fks-table-name)))]}
                                      nil)]
      (.setSchema conn session-schema)
      (with-open [stmt (sql-jdbc.execute/prepared-statement :ocient conn sql params)]
        (into
         #{}
         (common/reducible-results
          #(sql-jdbc.execute/execute-prepared-statement! :ocient stmt)
          (fn [^ResultSet rs]
            (fn []
              {:fk-column-name   (.getString rs fks-table-field-name)
               :dest-table       {:name   (.getString rs fks-table-dest-table-name)
                                  :schema session-schema}
               :dest-column-name id-column-key}))))))))

;; overriding describe fks to see if this will allow FKs to work in MB. May not benecessary to enable this to get manual FK support.
(defmethod driver/describe-table-fks :ocient
  [_ db-or-id-or-spec-or-conn table & _]
  ;; Return an empty sequence for the FKs tables themselves
  ;; (when (not (str/ends-with? db-name-or-nil fks-table-name-suffix))
  (when true
    (if (instance? Connection db-or-id-or-spec-or-conn)
      (describe-table-fks* db-or-id-or-spec-or-conn table)
      (let [spec (sql-jdbc.conn/db->pooled-connection-spec db-or-id-or-spec-or-conn)]
        (with-open [conn (jdbc/get-connection spec)]
          (describe-table-fks* conn table))))))

;;;;;;;;;;;;;;;;;;;;;
;;                 ;;
;; CREATE DATABASE ;;
;;                 ;;
;;;;;;;;;;;;;;;;;;;;;


;; Ocient requires a timestamp column and a clustering index key. These fields are prepended to the field definitions
(defmethod sql.tx/create-table-sql :ocient
  [driver {:keys [database-name]} {:keys [table-name field-definitions]}]
  (let [quot                  #(sql.u/quote-name driver :field (ddl.i/format-name driver %))]
    (str/join "\n"
              (list
               (format "CREATE TABLE %s (" (sql.tx/qualify-and-quote driver database-name table-name)),
               ;; HACK If no timestamp column exists, create one. A timestamp column is REQUIRED for all Ocient tables.
               ;; NOTE: ddl/insert-rows-honeysql-form routine will need to account for this additional column
               (format "  %s INT NOT NULL," id-column-key),
               (str/join
                ",\n"
                (for [{:keys [field-name base-type field-comment] :as field} field-definitions]
                  (str (format
                        ;; The table contains a TIMESTAMP column
                        "%s %s NULL"
                        (quot field-name)
                        (or (cond
                              (and (map? base-type) (contains? base-type :native))
                              (:native base-type)

                              (and (map? base-type) (contains? base-type :natives))
                              (get-in base-type [:natives driver])

                              base-type
                              (sql.tx/field-base-type->sql-type driver base-type))
                            (throw (ex-info (format "Missing datatype for field %s for driver: %s"
                                                    field-name driver)
                                            {:field field
                                             :driver driver
                                             :database-name database-name}))))

                       (when-let [comment (sql.tx/inline-column-comment-sql driver field-comment)]
                         (str " " comment))))),
               ",",
               (format "  CLUSTERING INDEX idx01 (%s)" id-column-key),
               (format ") AS SELECT 0, %s LIMIT 0"
                       (str/join  ", " (map (fn nullify [_] "NULL") field-definitions)))))))

(defmethod ddl/create-db-tables-ddl-statements :ocient
  [driver {:keys [database-name, table-definitions], :as dbdef} & _]
  ;; Build combined statement for creating tables + FKs + comments
  (let [statements (atom [])
        add!       (fn [& stmnts]
                     (swap! statements concat (filter some? stmnts)))]
    ;; Add the SQL for creating each Table
    (doseq [tabledef table-definitions]
      (add! (sql.tx/drop-table-if-exists-sql driver dbdef tabledef)
            (drop-fks-table-sql database-name (get tabledef :table-name))
            (sql.tx/create-table-sql driver dbdef tabledef)
            (create-fks-table-sql database-name (get tabledef :table-name))))
    ;; Add the SQL for adding FK constraints
    (doseq [{:keys [field-definitions], :as tabledef} table-definitions]
      (doseq [[id {:keys [fk], :as fielddef}] (map-indexed vector field-definitions)]
        (when fk
          (add! (add-fk-sql dbdef tabledef fielddef id)))))
    @statements))

(defmethod tx/create-db! :ocient
  [driver {:keys [table-definitions database-name] :as dbdef} & {:keys [skip-drop-db?] :as options}]
  ;; first execute statements to drop the DB if needed (this will do nothing if `skip-drop-db?` is true)
  (doseq [statement (apply ddl/drop-db-ddl-statements driver dbdef options)]
    (execute-sql! driver :server dbdef statement))
  ;; now execute statements to create the DB
  (doseq [statement (ddl/create-db-ddl-statements driver dbdef)]
    (execute-sql! driver :server dbdef statement))
  ;; next, get a set of statements for creating the DB & Tables
  (let [statements (apply ddl/create-db-tables-ddl-statements driver dbdef options)]
    ;; TODO Add support for combined statements in JDBC
    ;; execute each statement. Notice we're now executing in the `:db` context e.g. executing 
    ;; them for a specific DB rather than on `:server` (no DB in particular)
    (doseq [statement statements]
      (execute-sql! driver :db dbdef statement)))
  ;; Now load the data for each Table
  (doseq [tabledef table-definitions
          :let [reference-duration (or (some-> (get @reference-load-durations [(:database-name dbdef) (:table-name tabledef)])
                                               u/format-nanoseconds)
                                       "NONE")]]
    (u/profile (format "load-data for %s %s %s (reference H2 duration: %s)"
                       (name driver) (:database-name dbdef) (:table-name tabledef) reference-duration)
               (load-data/load-data! driver dbdef tabledef))))

(defprotocol ^:private Insertable
  (^:private ->insertable [this]
    "Convert a value to an appropriate Ocient type when inserting a new row."))

(extend-protocol Insertable
  nil
  (->insertable [_] nil)

  Object
  (->insertable [this] this)

  clojure.lang.Keyword
  (->insertable [k]
    (u/qualified-name k))

  java.time.temporal.Temporal
  (->insertable [t] (u.date/format-sql t))

  ;; normalize to UTC. Ocient complains when inserting values that have an offset
  java.time.OffsetDateTime
  (->insertable [t]
    (->insertable (t/local-date-time (t/with-offset-same-instant t (t/zone-offset 0)))))

  ;; for whatever reason the `date time zone-id` syntax that works in SQL doesn't work when loading data
  java.time.ZonedDateTime
  (->insertable [t]
    (->insertable (t/offset-date-time t)))

  ;; normalize to UTC, since Ocient doesn't support TIME WITH TIME ZONE
  java.time.OffsetTime
  (->insertable [t]
    (u.date/format-sql (t/local-time (t/with-offset-same-instant t (t/zone-offset 0))))))

;; Ocient has different syntax for inserting multiple rows, it looks like:
;;
;;    INSERT INTO table
;;        SELECT val1,val2 UNION ALL
;;        SELECT val1,val2 UNION ALL;
;;        SELECT val1,val2 UNION ALL;
;;
;; This custom HoneySQL type below generates the correct DDL statement
(defmethod ddl/insert-rows-honeysql-form :ocient
  [driver table-identifier row-or-rows]
  (reify hformat/ToSql
    (to-sql [_]
      (format
       "INSERT INTO \"%s\".\"%s\" SELECT %s"
       session-schema
       ((comp last :components) (into {} table-identifier))
       (let [rows                       (u/one-or-many row-or-rows)
             columns                    (keys (first rows))
             values  (for [row rows]
                       (for [value (map row columns)]
                         (hformat/to-sql
                          (sql.qp/->honeysql driver (->insertable value)))))]
         (str/join
          " UNION ALL SELECT "
          (map (fn [row] (str/join  ", " row)) values)))))))

(defmethod load-data/do-insert! :ocient
  [driver spec table-identifier row-or-rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier row-or-rows)]
    ;; `set-parameters` might try to look at DB timezone; we don't want to do that while loading the data because the
    ;; DB hasn't been synced yet
    (try
        ;; TODO - why don't we use `execute/execute-sql!` here like we do below?
      (doseq [sql+args statements]
        (let [sql (unprepare/unprepare driver sql+args)]
          (execute-sql-spec! spec sql)))
      (catch SQLException e
        (println (u/format-color 'red "INSERT FAILED: \n%s\n" statements))
        (jdbc/print-sql-exception-chain e)
        (throw e)))))

;; So this is kind of stupid - but the column order in each row provided 
;; will match the order of the table definition IFF the number of columns in the 
;; table is <9. 
;; 
;; TLDR;
;; This has to do with the usage of `zipmap` in the load-data module. The intent is
;; to zip two vectors mapping the values in vec1 to values in vec2. The result is a
;; map. When the number of columns is <=8, returned value is an PersistentArrayMap, 
;; but when >9, the value is a PersistentHashMap. Ocient requires the order of the 
;; values in INSERT INTO statement to match the table definition. 
;; https://clojuredocs.org/clojure.core/zipmap#example-5de00830e4b0ca44402ef7ed

(defn- add-ids-preserve-field-order
  "Add an `:id` column to each row in `rows`, for databases that should have data inserted with the ID explicitly
  specified. (This isn't meant for composition with `load-data-get-rows`; "
  [rows]
  (for [[i row] (m/indexed rows)]
    ;; Field order is preserved by supplying all KV args to the array-map constructor.
    ;; The default impl uses the into operator which may output an unsorted hash map.
    ;; (see load-data/add-ids)
    (apply array-map (keyword "id") (inc i) (flatten (vec row)))))

(defn- load-data-add-ids-preserve-field-order
  "Middleware function intended for use with `make-load-data-fn`. Add IDs to each row, presumabily for doing a parallel
  insert. This function should go before `load-data-chunked` or `load-data-one-at-a-time` in the `make-load-data-fn`
  args."
  [insert!]
  (fn [rows]
    (insert! (vec (add-ids-preserve-field-order rows)))))

(defn- load-data-get-rows-preserve-field-order
  "Used by `make-load-data-fn`; get a sequence of row maps for use in a `insert!` when loading table data."
  [_ _ tabledef]
  (let [fields-for-insert (mapv (comp keyword :field-name)
                                (:field-definitions tabledef))]
    ;; TIMEZONE FIXME
    (for [row (:rows tabledef)]
      ;; Field order is preserved by using array-map supplying all KV pairs to the
      ;; array-map constructor. The key list is first interleaved with the value list 
      ;; producing a flat KV list (i.e. [k1, v1, ..., kN, vN]) which is then piped 
      ;; through to the array-map constructor.
      ;;
      ;; The default implementation uses zipmap which may produce an unordered 
      ;; hash map (see load-data/load-data-get-rows).
      (apply array-map (interleave fields-for-insert row)))))

(defn- make-insert!
  "Used by `make-load-data-fn`; creates the actual `insert!` function that gets passed to the `insert-middleware-fns`
  described above."
  [driver conn {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
  (let [components       (for [component (sql.tx/qualified-name-components driver database-name table-name)]
                           (ddl.i/format-name driver (u/qualified-name component)))
        table-identifier (sql.qp/->honeysql driver (apply hx/identifier :table components))]
    (partial load-data/do-insert! driver conn table-identifier)))

(defn make-load-data-fn-preserve-field-order
  "Create an implementation of `load-data!`. This creates a function to actually insert a row or rows, wraps it with any
  `insert-middleware-fns`, the calls the resulting function with the rows to insert."
  [& insert-middleware-fns]
  (let [insert-middleware (apply comp insert-middleware-fns)]
    (fn [driver dbdef tabledef]
      (jdbc/with-db-connection [conn (spec/dbdef->spec driver :db dbdef)]
        (.setAutoCommit (jdbc/get-connection conn) false)
        (let [insert! (insert-middleware (make-insert! driver conn dbdef tabledef))
              rows    (load-data-get-rows-preserve-field-order driver dbdef tabledef)]
          (log/tracef "Inserting rows like: %s" (first rows))
          (insert! rows))))))

(def ^{:arglists '([driver dbdef tabledef])} load-data-chunked-parallel!
  "Insert rows in chunks of 200 at a time, in parallel."
  (make-load-data-fn-preserve-field-order load-data-add-ids-preserve-field-order (partial load-data/load-data-chunked pmap)))

(defmethod load-data/load-data! :ocient
  [& args]
  (apply load-data-chunked-parallel! args))

(defmethod sql.tx/drop-table-if-exists-sql :ocient
  [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s" (sql.tx/qualify-and-quote driver database-name table-name)))

(defmethod sql-jdbc.sync/filtered-syncable-schemas :ocient
  [_ _ _ _ _]
  #{session-schema})

(defmethod sql.tx/drop-db-if-exists-sql :ocient [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s" (sql.tx/qualify-and-quote driver database-name)))

(defmethod sql.tx/create-db-sql :ocient [driver {:keys [database-name]}]
  (format "CREATE DATABASE %s" (sql.tx/qualify-and-quote driver database-name)))
