(ns metabase.driver.sql-jdbc.sync.describe-database
  "SQL JDBC impl for `describe-database`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.sync.common :as common]
            [metabase.driver.sql-jdbc.sync.interface :as i]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models :refer [Database]]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.driver.util :as driver.u])
  (:import [java.sql Connection DatabaseMetaData ResultSet]
           java.util.regex.Pattern))

(defmethod i/excluded-schemas :sql-jdbc [_] nil)

(defn- schema-pattern->re-pattern ^Pattern [schema-pattern]
  (re-pattern (-> (str/replace schema-pattern #"(^|[^\\\\])\*" "$1.*")
                (str/replace #"(^|[^\\\\])," "$1|"))))

(defn- schema-patterns->filter-fn*
  [inclusion-patterns exclusion-patterns]
  (let [inclusion-blank? (str/blank? inclusion-patterns)
        exclusion-blank? (str/blank? exclusion-patterns)]
    (cond
      (and inclusion-blank? exclusion-blank?)
      (constantly true)

      (and (not inclusion-blank?) (not exclusion-blank?))
      (throw (ex-info "Inclusion and exclusion patterns cannot both be specified"
               {::inclusion-patterns inclusion-patterns
                ::exclusion-patterns exclusion-patterns}))

      true
      (let [inclusion? exclusion-blank?
            pattern    (schema-pattern->re-pattern (if inclusion? inclusion-patterns exclusion-patterns))]
        (fn [s]
          (let [m        (.matcher pattern s)
                matches? (.matches m)]
            (if inclusion? matches? (not matches?))))))))

(def ^:private schema-patterns->filter-fn (memoize schema-patterns->filter-fn*))

(defn include-schema?
  ;; TODO: add more docstring details here, and move to different ns (not strictly JDBC)
  "Returns true of the given `schema-name` should be included/synced, considering the given `inclusion-patterns` and
  `exclusion-patterns`."
  [schema-name inclusion-patterns exclusion-patterns]
  (let [filter-fn (schema-patterns->filter-fn inclusion-patterns exclusion-patterns)]
    (filter-fn schema-name)))

(defn all-schemas
  "Get a *reducible* sequence of all string schema names for the current database from its JDBC database metadata."
  [^DatabaseMetaData metadata]
  {:added "0.39.0", :pre [(instance? DatabaseMetaData metadata)]}
  (common/reducible-results
   #(.getSchemas metadata)
   (fn [^ResultSet rs]
     #(.getString rs "TABLE_SCHEM"))))

(defmethod i/syncable-schemas :sql-jdbc
  [driver _ metadata]
  (eduction (remove (set (i/excluded-schemas driver)))
            (all-schemas metadata)))

(defn simple-select-probe-query
  "Simple (ie. cheap) SELECT on a given table to test for access and get column metadata. Doesn't return
  anything useful (only used to check whether we can execute a SELECT query)

    (simple-select-probe-query :postgres \"public\" \"my_table\")
    ;; -> [\"SELECT TRUE FROM public.my_table WHERE 1 <> 1 LIMIT 0\"]"
  [driver schema table]
  {:pre [(string? table)]}
  ;; Using our SQL compiler here to get portable LIMIT (e.g. `SELECT TOP n ...` for SQL Server/Oracle)
  (let [honeysql {:select [[(sql.qp/->honeysql driver true) :_]]
                  :from   [(sql.qp/->honeysql driver (hx/identifier :table schema table))]
                  :where  [:not= 1 1]}
        honeysql (sql.qp/apply-top-level-clause driver :limit honeysql {:limit 0})]
    (sql.qp/format-honeysql driver honeysql)))

(defn- execute-select-probe-query
  "Execute the simple SELECT query defined above. The main goal here is to check whether we're able to execute a SELECT
  query against the Table in question -- we don't care about the results themselves -- so the query and the logic
  around executing it should be as simple as possible. We need to highly optimize this logic because it's executed for
  every Table on every sync."
  [driver ^Connection conn [sql & params]]
  {:pre [(string? sql)]}
  (with-open [stmt (common/prepare-statement driver conn sql params)]
    ;; attempting to execute the SQL statement will throw an Exception if we don't have permissions; otherwise it will
    ;; truthy wheter or not it returns a ResultSet, but we can ignore that since we have enough info to proceed at
    ;; this point.
    (.execute stmt)))

(defmethod i/have-select-privilege? :sql-jdbc
  [driver conn table-schema table-name]
  ;; Query completes = we have SELECT privileges
  ;; Query throws some sort of no permissions exception = no SELECT privileges
  (let [sql-args (simple-select-probe-query driver table-schema table-name)]
    (try
      (execute-select-probe-query driver conn sql-args)
      true
      (catch Throwable _
        false))))

(defn- db-tables
  "Fetch a JDBC Metadata ResultSet of tables in the DB, optionally limited to ones belonging to a given
  schema. Returns a reducible sequence of results."
  [driver ^DatabaseMetaData metadata ^String schema-or-nil ^String db-name-or-nil]
  (common/reducible-results
   #(.getTables metadata db-name-or-nil (some->> schema-or-nil (driver/escape-entity-name-for-metadata driver)) "%"
                (into-array String ["TABLE" "PARTITIONED TABLE" "VIEW" "FOREIGN TABLE" "MATERIALIZED VIEW"
                                    "EXTERNAL TABLE"]))
   (fn [^ResultSet rs]
     (fn []
       {:name        (.getString rs "TABLE_NAME")
        :schema      (.getString rs "TABLE_SCHEM")
        :description (when-let [remarks (.getString rs "REMARKS")]
                       (when-not (str/blank? remarks)
                         remarks))}))))

(defn fast-active-tables
  "Default, fast implementation of `active-tables` best suited for DBs with lots of system tables (like Oracle). Fetch
  list of schemas, then for each one not in `excluded-schemas`, fetch its Tables, and combine the results.

  This is as much as 15x faster for Databases with lots of system tables than `post-filtered-active-tables` (4 seconds
  vs 60)."
  [driver ^Connection conn & [db-name-or-nil schema-inclusion-filters schema-exclusion-filters]]
  {:pre [(instance? Connection conn)]}
  (let [metadata (.getMetaData conn)]
    (eduction
     (comp (mapcat (fn [schema]
                     (db-tables driver metadata schema db-name-or-nil)))
           (filter (fn [{table-schema :schema, table-name :name}]
                     (and
                       (include-schema? table-schema schema-inclusion-filters schema-exclusion-filters)
                       (i/have-select-privilege? driver conn table-schema table-name)))))
     (i/syncable-schemas driver conn metadata))))

(defmethod i/active-tables :sql-jdbc
  [driver connection schema-inclusion-filters schema-exclusion-filters]
  (fast-active-tables driver connection nil schema-inclusion-filters schema-exclusion-filters))

(defn post-filtered-active-tables
  "Alternative implementation of `active-tables` best suited for DBs with little or no support for schemas. Fetch *all*
  Tables, then filter out ones whose schema is in `excluded-schemas` Clojure-side."
  [driver ^Connection conn & [db-name-or-nil schema-inclusion-filters schema-exclusion-filters]]
  {:pre [(instance? Connection conn)]}
  (eduction
   (filter (let [excluded (i/excluded-schemas driver)]
             (fn [{table-schema :schema, table-name :name}]
               (and (not (contains? excluded table-schema))
                    (include-schema? table-schema schema-inclusion-filters schema-exclusion-filters)
                    (i/have-select-privilege? driver conn table-schema table-name)))))
   (db-tables driver (.getMetaData conn) nil db-name-or-nil)))

(defn- db-or-id-or-spec->database [db-or-id-or-spec]
  (cond (instance? (class Database) db-or-id-or-spec)
        db-or-id-or-spec

        (int? db-or-id-or-spec)
        (Database db-or-id-or-spec)

        true
        nil))

(defn describe-database
  "Default implementation of `driver/describe-database` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db-or-id-or-spec]
  {:tables (with-open [conn (jdbc/get-connection (sql-jdbc.conn/db->pooled-connection-spec db-or-id-or-spec))]
             ;; try to set the Connection to `READ_UNCOMMITED` if possible, or whatever the next least-locking level
             ;; is. Not sure how much of a difference that makes since we're not running this inside a transaction,
             ;; but better safe than sorry
             (sql-jdbc.execute/set-best-transaction-level! driver conn)
             (let [schema-filter-prop      (driver.u/find-schema-filters-prop driver)
                   has-schema-filter-prop? (some? schema-filter-prop)
                   default-active-tbl-fn   #(into #{} (i/active-tables driver conn nil nil))]
               (if has-schema-filter-prop?
                 (if-let [database (db-or-id-or-spec->database db-or-id-or-spec)]
                   (let [prop-nm                (:name schema-filter-prop)
                         db-details             (:details database)
                         schema-filter-type     (get db-details(keyword (str prop-nm "-type")))
                         schema-filter-patterns (get db-details (keyword (str prop-nm "-patterns")))
                         exclusion-type?        (= "exclusion" schema-filter-type)]
                     (into #{} (i/active-tables driver
                                                conn
                                                (when-not exclusion-type? schema-filter-patterns)
                                                (when exclusion-type? schema-filter-patterns))))
                   (default-active-tbl-fn))
                 (default-active-tbl-fn))))})
