(ns metabase.driver.sql-jdbc.sync.describe-database
  "SQL JDBC impl for `describe-database`."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.common :as sql-jdbc.sync.common]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.query-processor.store :as qp.store]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.util.honeysql-extensions :as hx]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.sql Connection DatabaseMetaData ResultSet)))

(set! *warn-on-reflection* true)

(defmethod sql-jdbc.sync.interface/excluded-schemas :sql-jdbc [_] nil)

(defn all-schemas
  "Get a *reducible* sequence of all string schema names for the current database from its JDBC database metadata."
  [^DatabaseMetaData metadata]
  {:added "0.39.0", :pre [(instance? DatabaseMetaData metadata)]}
  (sql-jdbc.sync.common/reducible-results
   #(.getSchemas metadata)
   (fn [^ResultSet rs]
     #(.getString rs "TABLE_SCHEM"))))

(defmethod sql-jdbc.sync.interface/filtered-syncable-schemas :sql-jdbc
  [driver _ metadata schema-inclusion-patterns schema-exclusion-patterns]
  (eduction (remove (set (sql-jdbc.sync.interface/excluded-schemas driver)))
            ;; remove the persisted_model schemas
            (remove (fn [schema] (re-find #"^metabase_cache.*" schema)))
            (filter (partial driver.s/include-schema? schema-inclusion-patterns schema-exclusion-patterns))
            (all-schemas metadata)))

(mu/defn simple-select-probe-query :- [:cat ms/NonBlankString [:* :any]]
  "Simple (ie. cheap) SELECT on a given table to test for access and get column metadata. Doesn't return
  anything useful (only used to check whether we can execute a SELECT query)

    (simple-select-probe-query :postgres \"public\" \"my_table\")
    ;; -> [\"SELECT TRUE FROM public.my_table WHERE 1 <> 1 LIMIT 0\"]"
  [driver :- :keyword
   schema :- [:maybe :string] ; I think technically some DBs like SQL Server support empty schema and table names
   table  :- :string]
  ;; Using our SQL compiler here to get portable LIMIT (e.g. `SELECT TOP n ...` for SQL Server/Oracle)
  (sql.qp/with-driver-honey-sql-version driver
    (let [tru      (sql.qp/->honeysql driver true)
          table    (sql.qp/->honeysql driver (hx/identifier :table schema table))
          honeysql (case (long hx/*honey-sql-version*)
                     1 {:select [[tru :_]]
                        :from   [table]
                        :where  [:not= 1 1]}
                     2 {:select [[tru :_]]
                        :from   [[table]]
                        :where  [:inline [:not= 1 1]]})
          honeysql (sql.qp/apply-top-level-clause driver :limit honeysql {:limit 0})]
      (sql.qp/format-honeysql driver honeysql))))

(defn- execute-select-probe-query
  "Execute the simple SELECT query defined above. The main goal here is to check whether we're able to execute a SELECT
  query against the Table in question -- we don't care about the results themselves -- so the query and the logic
  around executing it should be as simple as possible. We need to highly optimize this logic because it's executed for
  every Table on every sync."
  [driver ^Connection conn [sql & params]]
  {:pre [(string? sql)]}
  (with-open [stmt (sql-jdbc.sync.common/prepare-statement driver conn sql params)]
    (log/tracef "[%s] %s" (name driver) sql)
    ;; attempting to execute the SQL statement will throw an Exception if we don't have permissions; otherwise it will
    ;; truthy wheter or not it returns a ResultSet, but we can ignore that since we have enough info to proceed at
    ;; this point.
    (.execute stmt)))

(defmethod sql-jdbc.sync.interface/have-select-privilege? :sql-jdbc
  [driver ^Connection conn table-schema table-name]
  ;; Query completes = we have SELECT privileges
  ;; Query throws some sort of no permissions exception = no SELECT privileges
  (let [sql-args (simple-select-probe-query driver table-schema table-name)]
    (log/tracef "Checking for SELECT privileges for %s with query %s"
                (str (when table-schema
                       (str (pr-str table-schema) \.))
                     (pr-str table-name))
                (pr-str sql-args))
    (try
      (execute-select-probe-query driver conn sql-args)
      (log/trace "SELECT privileges confirmed")
      true
      (catch Throwable e
        (log/trace e "Assuming no SELECT privileges: caught exception")
        (when-not (.getAutoCommit conn)
          (.rollback conn))
        false))))

(defn db-tables
  "Fetch a JDBC Metadata ResultSet of tables in the DB, optionally limited to ones belonging to a given
  schema. Returns a reducible sequence of results."
  [driver ^DatabaseMetaData metadata ^String schema-or-nil ^String db-name-or-nil]
  (with-open [rset (.getTables metadata db-name-or-nil (some->> schema-or-nil (driver/escape-entity-name-for-metadata driver)) "%"
                               (into-array String ["TABLE" "PARTITIONED TABLE" "VIEW" "FOREIGN TABLE" "MATERIALIZED VIEW"
                                                   "EXTERNAL TABLE" "DYNAMIC_TABLE"]))]
    (loop [acc []]
      (if-not (.next rset)
        acc
        (recur (conj acc {:name        (.getString rset "TABLE_NAME")
                          :schema      (.getString rset "TABLE_SCHEM")
                          :description (when-let [remarks (.getString rset "REMARKS")]
                                         (when-not (str/blank? remarks)
                                           remarks))}))))))

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
           (filter (fn [{table-schema :schema table-name :name}]
                     (sql-jdbc.sync.interface/have-select-privilege? driver conn table-schema table-name))))
     (sql-jdbc.sync.interface/filtered-syncable-schemas driver conn metadata
                                                        schema-inclusion-filters schema-exclusion-filters))))

(defmethod sql-jdbc.sync.interface/active-tables :sql-jdbc
  [driver connection schema-inclusion-filters schema-exclusion-filters]
  (fast-active-tables driver connection nil schema-inclusion-filters schema-exclusion-filters))

(defn post-filtered-active-tables
  "Alternative implementation of `active-tables` best suited for DBs with little or no support for schemas. Fetch *all*
  Tables, then filter out ones whose schema is in `excluded-schemas` Clojure-side."
  [driver ^Connection conn & [db-name-or-nil schema-inclusion-filters schema-exclusion-filters]]
  {:pre [(instance? Connection conn)]}
  (eduction
   (filter (let [excluded (sql-jdbc.sync.interface/excluded-schemas driver)]
             (fn [{table-schema :schema, table-name :name}]
               (and (not (contains? excluded table-schema))
                    (driver.s/include-schema? schema-inclusion-filters schema-exclusion-filters table-schema)
                    (sql-jdbc.sync.interface/have-select-privilege? driver conn table-schema table-name)))))
   (db-tables driver (.getMetaData conn) nil db-name-or-nil)))

(defn- db-or-id-or-spec->database [db-or-id-or-spec]
  (cond (mi/instance-of? Database db-or-id-or-spec)
        db-or-id-or-spec

        (int? db-or-id-or-spec)
        (qp.store/with-metadata-provider db-or-id-or-spec
          (lib.metadata/database (qp.store/metadata-provider)))

        :else
        nil))

(mu/defn describe-database
  "Default implementation of [[metabase.driver/describe-database]] for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver           :- :keyword
   db-or-id-or-spec :- [:or :int :map]]
  {:tables
   (sql-jdbc.execute/do-with-connection-with-options
    driver
    db-or-id-or-spec
    nil
    (fn [^Connection conn]
      (let [schema-filter-prop      (driver.u/find-schema-filters-prop driver)
            has-schema-filter-prop? (some? schema-filter-prop)
            default-active-tbl-fn   #(into #{} (sql-jdbc.sync.interface/active-tables driver conn nil nil))]
        (if has-schema-filter-prop?
          (if-let [database (db-or-id-or-spec->database db-or-id-or-spec)]
            (let [prop-nm                                 (:name schema-filter-prop)
                  [inclusion-patterns exclusion-patterns] (driver.s/db-details->schema-filter-patterns
                                                           prop-nm
                                                           database)]
              (into #{} (sql-jdbc.sync.interface/active-tables driver conn inclusion-patterns exclusion-patterns)))
            (default-active-tbl-fn))
          (default-active-tbl-fn)))))})
