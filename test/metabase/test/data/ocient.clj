(ns metabase.test.data.ocient
  (:require [clj-time.core :as time]
            [clj-time.coerce :as tc]
            [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.reader.edn :as edn]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [honeysql.helpers :as h]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql-jdbc.sync.common :as common]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.driver.sql.util :as sql.u]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.sync.field-values :as sync-field-values]
            [metabase.sync.sync-metadata :as sync-metadata]
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
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s])
  (:import java.sql.SQLException
           [java.sql Connection DatabaseMetaData ResultSet]))

(sql-jdbc.tx/add-test-extensions! :ocient)

;; Use the public schema for all tables
(defonce session-schema (str "public"))

;; Additional columns required by the Ocient database 
(defonce id-column-key (str "id"))
(defonce timestamp-column-key (str "created"))

;; Define the primary key type
(defmethod sql.tx/pk-sql-type :ocient [_] "INT NOT NULL")

;; Lowercase and replace hyphens/spaces with underscores
(defmethod tx/format-name :ocient
  [_ s]
  (str/replace (str/lower-case s) #"-| " "_"))

(defmethod sql.tx/qualified-name-components :ocient [& args]
  (apply tx/single-db-qualified-name-components session-schema args))

(defonce ^:private reference-load-durations
  (delay (edn/read-string (slurp "test_resources/load-durations.edn"))))

(def ^:private db-connection-details
  (delay
   {:host     (tx/db-test-env-var :ocient :host "localhost")
    :port     (tx/db-test-env-var :ocient :port "4051")
    :user     (tx/db-test-env-var :ocient :user "admin@system")
    :password (tx/db-test-env-var :ocient :password "admin")
    :additional-options "loglevel=TRACE;logfile=/ocient/db/metabase/ocient_jdbc.log;pooling=OFF"}))

(defmethod tx/dbdef->connection-details :ocient
  [driver context {:keys [database-name]}]
  (merge @db-connection-details
         (when (= context :server)
           {:db "system"})
         (when (= context :db)
           {:db (tx/format-name driver database-name)})))

(doseq [[base-type db-type] {:type/BigInteger     "BIGINT"
                             :type/Boolean        "BOOL"
                             :type/Date           "DATE"
                             :type/DateTime       "TIMESTAMP"
                             :type/DateTimeWithTZ "TIMESTAMP"
                             :type/ZonedDateTime  "TIMESTAMP"
                             :type/Decimal        "DECIMAL(16, 4)"
                             :type/Float          "FLOAT"
                             :type/Integer        "INT"
                             :type/IPAddress      "IPV4"
                             :type/*              "VARCHAR(255)"
                             :type/Text           "VARCHAR(255)"
                             :type/Time           "TIME"
                             :type/TimeWithTZ     "TIMESTAMP"
                             :type/UUID           "UUID"}]
  (defmethod sql.tx/field-base-type->sql-type [:ocient base-type] [_ _] db-type))
(defonce timestamp-base-types
  (set [:type/DateTime :type/DateTimeWithTZ :type/ZonedDateTime]))

(defmethod sql.qp/->honeysql [:ocient :relative-datetime]
  [driver [_ amount unit]]
  (sql.qp/date driver unit (if (zero? amount)
                             (sql.qp/current-datetime-honeysql-form driver)
                             (sql.qp/add-interval-honeysql-form driver (sql.qp/current-datetime-honeysql-form driver) amount unit))))

(defmethod sql.qp/add-interval-honeysql-form :ocient
  [_ hsql-form amount unit]
  (hx/+
   (hx/->timestamp hsql-form)
   (case unit
     :second   (hsql/call :seconds amount)
     :minute   (hsql/call :minutes amount)
     :hour     (hsql/call :hours amount)
     :day      (hsql/call :days amount)
     :week     (hsql/call :weeks amount)
     :month    (hsql/call :months amount)
     :quarter  (hsql/call :months (hx/* amount (hsql/raw 3)))
     :quarters (hsql/call :months (hx/* amount (hsql/raw 3)))
     :year     (hsql/call :years amount))))

(defmethod sql.qp/unix-timestamp->honeysql [:ocient :seconds]
  [_ _ field-or-value]
  (hsql/call :to_timestamp field-or-value))

(defmethod sql.qp/unix-timestamp->honeysql [:ocient :milliseconds]
  [driver _ field-or-value]
  (sql.qp/unix-timestamp->honeysql driver :seconds (hx// field-or-value (hsql/raw 1000))))

(defmethod sql.qp/unix-timestamp->honeysql [:ocient :microseconds]
  [driver _ field-or-value]
  (sql.qp/unix-timestamp->honeysql driver :seconds (hx// field-or-value (hsql/raw 1000000))))

(defn- parse-datetime    [format-str expr] (hsql/call :parsedatetime expr  (hx/literal format-str)))

;; Rounding dates to quarters is a bit involved but still doable. Here's the plan:
;; *  extract the year and quarter from the date;
;; *  convert the quarter (1 - 4) to the corresponding starting month (1, 4, 7, or 10).
;;    (do this by multiplying by 3, giving us [3 6 9 12]. Then subtract 2 to get [1 4 7 10]);
;; *  concatenate the year and quarter start month together to create a yyyymm date string;
;; *  parse the string as a date. :sunglasses:
;;
;; Postgres DATE_TRUNC('quarter', x)
;; becomes  PARSEDATETIME(CONCAT(YEAR(x), ((QUARTER(x) * 3) - 2)), 'yyyyMM')
(defmethod sql.qp/date [:ocient :quarter]
  [_ _ expr]
  (parse-datetime "yyyyMM"
                  (hx/concat (hx/year expr) (hx/- (hx/* (hx/quarter expr)
                                                        3)
                                                  2))))

(defn in?
  "true if coll contains elm"
  [coll elm]
  (some #(= elm %) coll))

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

;; Ocient requires a timestamp column and a clustering index key. These fields are prepended to the field definitions
(defmethod sql.tx/create-table-sql :ocient
  [driver {:keys [database-name]} {:keys [table-name field-definitions]}]
  (let [quot          #(sql.u/quote-name driver :field (tx/format-name driver %))]
    (str/join "\n"
              (list
               (format "CREATE TABLE %s (" (sql.tx/qualify-and-quote driver database-name table-name)),
               (format "  %s TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0'," timestamp-column-key),
               (format "  %s INT NOT NULL," id-column-key),
               (str/join
                ",\n"
                (for [{:keys [field-name base-type field-comment] :as field} field-definitions]
                  (str (format "  %s %s"
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
               ")"))))

;;A System Administrator must first create the database before the tests can procede
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
      (println (format "EXECUTING [ddl/create-db-tables-ddl-statements] %s" (pr-str statement)))
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
    (u.date/format-sql (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

  ;; Convert the HoneySQL `timestamp(...)` form we sometimes use to wrap a `Timestamp` to a plain literal string
  honeysql.types.SqlCall
  (->insertable [{[{s :literal}] :args, fn-name :name}]
    (assert (= (name fn-name) "timestamp"))
    (->insertable (u.date/parse (str/replace s #"'" "")))))

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
          (log/debugf "[insert] %s" (pr-str sql))
          (execute-sql-spec! spec sql)))
      (catch SQLException e
        (println (u/format-color 'red "INSERT FAILED: \n%s\n" statements))
        (jdbc/print-sql-exception-chain e)
        (throw e)))))


(defn- add-ids
  "Add an `:id` column to each row in `rows`, for databases that should have data inserted with the ID explicitly
  specified. (This isn't meant for composition with `load-data-get-rows`; "
  [rows]
  (let [columns                    (keys (first rows))]
    (log/infof "Processing row like %s" (pr-str (first rows)))
    (log/infof "Processing row like %s" (type (first rows)))
    (for [[i row] (m/indexed rows)]
      (if (in? columns :created_at)
        (apply array-map (keyword id-column-key) (inc i) (flatten (vec row)))
        (apply array-map (keyword timestamp-column-key) (tc/to-long (time/now)) (keyword id-column-key) (inc i) (flatten (vec row)))))))

(defn- load-data-add-ids
  "Middleware function intended for use with `make-load-data-fn`. Add IDs to each row, presumabily for doing a parallel
  insert. This function should go before `load-data-chunked` or `load-data-one-at-a-time` in the `make-load-data-fn`
  args."
  [insert!]
  (fn [rows]
    (insert! (vec (add-ids rows)))))


(defn- load-data [dbdef tabledef]
  ;; the JDBC driver statements fail with a cryptic status 500 error if there are too many
  ;; parameters being set in a single statement; these numbers were arrived at empirically
  (let [chunk-size (case (:table-name tabledef)
                     "people" 30
                     "reviews" 40
                     "orders" 30
                     "venues" 50
                     "products" 20
                     "cities" 50
                     "sightings" 50
                     "incidents" 50
                     "checkins" 25
                     "airport" 50
                     100)
        load-fn    (load-data/make-load-data-fn load-data-add-ids
                                                (partial load-data/load-data-chunked pmap chunk-size))]
    (load-fn :ocient dbdef tabledef)))

;; Ocient requires an id and a timestamp for each row
(defmethod load-data/load-data! :ocient [_ dbdef tabledef]
  (load-data dbdef tabledef))

(defmethod tx/destroy-db! :ocient [driver dbdef]
  (println "Ocient destroy-db! entered")
  nil)

(defmethod sql.tx/drop-table-if-exists-sql :ocient
  [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s" (sql.tx/qualify-and-quote driver database-name table-name)))

(defmethod tx.impl/verify-data-loaded-correctly :ocient
  [_ _ _]
  (println "Ocient verify data loaded")
  nil)

(defmethod sql-jdbc.sync/syncable-schemas :ocient
  [driver conn metadata]
  #{session-schema})

(defmethod sql.tx/drop-db-if-exists-sql :ocient [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s" (sql.tx/qualify-and-quote driver database-name)))

(defmethod sql.tx/create-db-sql :ocient [driver {:keys [database-name]}]
  (format "CREATE DATABASE %s" (sql.tx/qualify-and-quote driver database-name)))

(defmethod sql-jdbc.sync/syncable-schemas :ocient
  [driver conn metadata]
  #{session-schema})
