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
   [metabase.models.interface :as mi]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.honey-sql-2 :as h2x]
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
   schema :- [:maybe :string]        ; I think technically some DBs like SQL Server support empty schema and table names
   table  :- :string]
  ;; Using our SQL compiler here to get portable LIMIT (e.g. `SELECT TOP n ...` for SQL Server/Oracle)
  (let [tru      (sql.qp/->honeysql driver true)
        table    (sql.qp/->honeysql driver (h2x/identifier :table schema table))
        honeysql {:select [[tru :_]]
                  :from   [[table]]
                  :where  [:inline [:not= 1 1]]}
        honeysql (sql.qp/apply-top-level-clause driver :limit honeysql {:limit 0})]
    (sql.qp/format-honeysql driver honeysql)))

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
  ;; seems like some JDBC drivers like Snowflake are dumb and still narrow the search results by the current session
  ;; schema if you pass in `nil` for `schema-or-nil`, which means not to narrow results at all... For Snowflake, I fixed
  ;; this by passing in `"%"` instead -- consider making this the default behavior. See this Slack thread
  ;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1706220295862639?thread_ts=1706156558.940489&cid=C04DN5VRQM6 for
  ;; more info.
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
                                           remarks))
                          :type        (.getString rset "TABLE_TYPE")}))))))

(defn- schema+table-with-select-privileges
  [driver database]
  (->> (driver/current-user-table-privileges driver database)
       (filter #(true? (:select %)))
       (map (fn [{:keys [schema table]}]
              [schema table]))
       set))

(defn- have-select-privilege-fn
  "Returns a function that take a map with 3 keys [:schema, :name, :type], return true if we can do a select query on the table.

  This function shouldn't be called a `map` or anything alike, instead use it as a cache function like so:

    (let [have-select-privilege-fn* (have-select-privilege-fn driver database conn)
          tables                   ...]
      (filter have-select-privilege-fn* tables))"
  [driver database conn]
  ;; `sql-jdbc.sync.interface/have-select-privilege?` is slow because we're doing a SELECT query on each table
  ;; It's basically a N+1 operation where N is the number of tables in the database
  (if (driver/database-supports? driver :table-privileges database)
    (let [schema+table-with-select-privileges (schema+table-with-select-privileges driver database)]
      (fn [{schema :schema table :name ttype :type}]
        ;; driver/current-user-table-privileges does not return privileges for external table on redshift, and foreign
        ;; table on postgres, so we need to use the select method on them
        (if (#{[:redshift "EXTERNAL TABLE"] [:postgres "FOREIGN TABLE"]}
             [driver ttype])
          (sql-jdbc.sync.interface/have-select-privilege? driver conn schema table)
          (contains? schema+table-with-select-privileges [schema table]))))
    (fn [{schema :schema table :name}]
      (sql-jdbc.sync.interface/have-select-privilege? driver conn schema table))))

(defn fast-active-tables
  "Default, fast implementation of `active-tables` best suited for DBs with lots of system tables (like Oracle). Fetch
  list of schemas, then for each one not in `excluded-schemas`, fetch its Tables, and combine the results.

  This is as much as 15x faster for Databases with lots of system tables than `post-filtered-active-tables` (4 seconds
  vs 60)."
  [driver database ^Connection conn & [db-name-or-nil schema-inclusion-filters schema-exclusion-filters]]
  {:pre [(instance? Connection conn)]}
  (let [metadata                  (.getMetaData conn)
        syncable-schemas          (sql-jdbc.sync.interface/filtered-syncable-schemas driver conn metadata
                                                                                     schema-inclusion-filters schema-exclusion-filters)
        have-select-privilege-fn? (have-select-privilege-fn driver database conn)]
    (eduction (mapcat (fn [schema]
                        (->> (db-tables driver metadata schema db-name-or-nil)
                             (filter have-select-privilege-fn?)
                             (map #(dissoc % :type))))) syncable-schemas)))

(defmethod sql-jdbc.sync.interface/active-tables :sql-jdbc
  [driver database connection schema-inclusion-filters schema-exclusion-filters]
  (fast-active-tables driver database connection nil schema-inclusion-filters schema-exclusion-filters))

(defn post-filtered-active-tables
  "Alternative implementation of `active-tables` best suited for DBs with little or no support for schemas. Fetch *all*
  Tables, then filter out ones whose schema is in `excluded-schemas` Clojure-side."
  [driver database ^Connection conn & [db-name-or-nil schema-inclusion-filters schema-exclusion-filters]]
  {:pre [(instance? Connection conn)]}
  (let [have-select-privilege-fn? (have-select-privilege-fn driver database conn)]
    (eduction
     (comp
      (filter (let [excluded (sql-jdbc.sync.interface/excluded-schemas driver)]
                (fn [{table-schema :schema :as table}]
                  (and (not (contains? excluded table-schema))
                       (driver.s/include-schema? schema-inclusion-filters schema-exclusion-filters table-schema)
                       (have-select-privilege-fn? table)))))
      (map #(dissoc % :type)))
     (db-tables driver (.getMetaData conn) nil db-name-or-nil))))

(defn- db-or-id-or-spec->database [db-or-id-or-spec]
  (cond (mi/instance-of? :model/Database db-or-id-or-spec)
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
            database                (db-or-id-or-spec->database db-or-id-or-spec)
            default-active-tbl-fn   #(into #{} (sql-jdbc.sync.interface/active-tables driver database conn nil nil))]
        (if has-schema-filter-prop?
          ;; TODO: the else of this branch seems uncessary, why do you want to call describe-database on a database that
          ;; does not exists?
          (if (some? database)
            (let [prop-nm                                 (:name schema-filter-prop)
                  [inclusion-patterns exclusion-patterns] (driver.s/db-details->schema-filter-patterns
                                                           prop-nm
                                                           database)]
              (into #{} (sql-jdbc.sync.interface/active-tables driver database conn inclusion-patterns exclusion-patterns)))
            (default-active-tbl-fn))
          (default-active-tbl-fn)))))})
