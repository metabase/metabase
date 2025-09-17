(ns metabase.driver.sql-jdbc.sync.describe-database
  "SQL JDBC impl for `describe-database`."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.common :as sql-jdbc.sync.common]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
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

(defn include-schema-logging-exclusion
  "Wrapper for [[metabase.driver.sync/include-schema?]] which logs an info message in case of exclusion"
  [schema-inclusion-filters schema-exclusion-filters table-schema]
  (or (driver.s/include-schema? schema-inclusion-filters schema-exclusion-filters table-schema)
      (log/infof "Skipping schema '%s' because it does not match the current schema filtering settings" table-schema)))

(defmethod sql-jdbc.sync.interface/filtered-syncable-schemas :sql-jdbc
  [driver _ metadata schema-inclusion-filters schema-exclusion-filters]
  (eduction (remove (set (sql-jdbc.sync.interface/excluded-schemas driver)))
            ;; remove the persisted_model schemas
            (remove (fn [schema] (re-find #"^metabase_cache.*" schema)))
            (filter #(include-schema-logging-exclusion schema-inclusion-filters schema-exclusion-filters %))
            (all-schemas metadata)))

(mu/defn simple-select-probe-query :- [:cat driver-api/schema.common.non-blank-string [:* :any]]
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

(def ^:dynamic *select-probe-query-timeout-seconds*
  "time to wait on the select probe query"
  15)

(defn- execute-select-probe-query
  "Execute the simple SELECT query defined above. The main goal here is to check whether we're able to execute a SELECT
  query against the Table in question -- we don't care about the results themselves -- so the query and the logic
  around executing it should be as simple as possible. We need to highly optimize this logic because it's executed for
  every Table on every sync."
  [driver ^Connection conn [sql & params]]
  {:pre [(string? sql)]}
  (with-open [stmt (sql-jdbc.sync.common/prepare-statement driver conn sql params)]
    ;; attempting to execute the SQL statement will throw an Exception if we don't have permissions; otherwise it will
    ;; truthy wheter or not it returns a ResultSet, but we can ignore that since we have enough info to proceed at
    ;; this point.
    (doto stmt
      (.setQueryTimeout *select-probe-query-timeout-seconds*)
      (.execute))))

(defn- pr-table [table-schema table-name]
  (str (when table-schema
         (str (pr-str table-schema) \.))
       (pr-str table-name)))

(defmethod sql-jdbc.sync.interface/have-select-privilege? :sql-jdbc
  [driver ^Connection outer-conn table-schema table-name & {:keys [retry?]}]
  ;; Query completes = we have SELECT privileges
  ;; Query throws some sort of no permissions exception = no SELECT privileges
  (let [sql-args (simple-select-probe-query driver table-schema table-name)
        ;; we must attempt to use a connection local to [[have-select-privilege?]],
        ;; else if the connection closes, even if we manage to reopen it in this local context
        ;; outer unrealized resultsets (like the [[all-schemas]] results) may get
        ;; unrecoverably closed
        conn (sql-jdbc.execute/try-ensure-open-conn! driver outer-conn :force-context-local? true)]
    (log/debugf "have-select-privilege? sql-jdbc: Checking for SELECT privileges for %s with query\n%s"
                (pr-table table-schema table-name)
                (pr-str sql-args))
    (try
      (log/debug "have-select-privilege? sql-jdbc: Attempt to execute probe query")
      (execute-select-probe-query driver conn sql-args)
      (log/infof "%s: SELECT privileges confirmed" (pr-table table-schema table-name))
      true
      (catch Throwable e

        (let [;; Let's try to ensure the connection is not just open but also valid.
              ;; Snowflake closes the connection but doesn't set it as  closed in the object,
              ;; so we must explicitely check if it's valid so that subsequent calls to [[sql-jdbc.execute/try-ensure-open-conn!]]
              ;; will obtain a new connection
              is-open (sql-jdbc.execute/is-conn-open? conn :check-valid? true)

              allow? (driver/query-canceled? driver e)]

          (if allow?
            (log/infof "%s: Assuming SELECT privileges: caught timeout exception" (pr-table table-schema table-name))
            (log/debugf e "%s: Assuming no SELECT privileges: caught exception" (pr-table table-schema table-name)))

          ;; if the connection was closed this will throw an error and fail the sync loop so we prevent this error from
          ;; affecting anything higher
          (try (when-not (.getAutoCommit conn)
                 (.rollback conn))
               (catch Throwable _))
          (if (and (not allow?) (not retry?) (not is-open))
            (sql-jdbc.sync.interface/have-select-privilege? driver conn table-schema table-name :retry? true)
            allow?))))))

(defn- jdbc-get-tables
  [driver ^DatabaseMetaData metadata catalog schema-pattern tablename-pattern types]
  (sql-jdbc.sync.common/reducible-results
   #(do (log/debugf "jdbc-get-tables: Calling .getTables for catalog `%s`" catalog)
        (.getTables metadata catalog
                    (some->> schema-pattern (driver/escape-entity-name-for-metadata driver))
                    (some->> tablename-pattern (driver/escape-entity-name-for-metadata driver))
                    (when (seq types) (into-array String types))))
   (fn [^ResultSet rset]
     (fn []
       (let [name (.getString rset "TABLE_NAME")
             schema (.getString rset "TABLE_SCHEM")
             ttype (.getString rset "TABLE_TYPE")]
         (log/debugf "jdbc-get-tables: Fetched object: schema `%s` name `%s` type `%s`" schema name ttype)
         {:name        name
          :schema      schema
          :description (when-let [remarks (.getString rset "REMARKS")]
                         (when-not (str/blank? remarks)
                           remarks))
          :type        ttype})))))

(defn db-tables
  "Fetch a JDBC Metadata ResultSet of tables in the DB, optionally limited to ones belonging to a given
  schema. Returns a reducible sequence of results."
  [driver ^DatabaseMetaData metadata ^String schema-or-nil ^String db-name-or-nil]
  ;; seems like some JDBC drivers like Snowflake are dumb and still narrow the search results by the current session
  ;; schema if you pass in `nil` for `schema-or-nil`, which means not to narrow results at all... For Snowflake, I fixed
  ;; this by passing in `"%"` instead -- consider making this the default behavior. See this Slack thread
  ;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1706220295862639?thread_ts=1706156558.940489&cid=C04DN5VRQM6 for
  ;; more info.
  (jdbc-get-tables driver metadata db-name-or-nil schema-or-nil "%"
                   ["TABLE" "PARTITIONED TABLE" "VIEW" "FOREIGN TABLE" "MATERIALIZED VIEW"
                    "EXTERNAL TABLE" "DYNAMIC_TABLE"]))

(defn- build-privilege-map
  "Build a nested map of schema -> table -> set of permissions from current user table privileges.
  There are 2 permissions:
  - :select - self-explained
  - :write - must have insert, update, and delete permisisons. used for table data editing"
  [driver conn]
  (->> (sql-jdbc.sync.interface/current-user-table-privileges driver {:connection conn})
       (reduce (fn [acc {:keys [schema table select insert update delete]}]
                 (assoc-in acc [schema table]
                           (cond-> #{}
                             select (conj :select)
                             (and insert update delete) (conj :write))))
               {})))

(defn have-privilege-fn
  "Returns a function that takes a map with 3 keys [:schema, :name, :type] and a privilege type,
   returns true if the table has the specified privilege.

   Privilege types:
   - :select - Can read from the table
   - :write - if table has insert, update, delete permissions

  This function shouldn't be called with `map` or anything alike, instead use it as a cache function like so:

    (let [privilege-fn (have-privilege-fn driver conn)
          tables       ...]
      (filter #(privilege-fn % :select) tables))"
  [driver conn]
  ;; `sql-jdbc.sync.interface/have-select-privilege?` is slow because we're doing a SELECT query on each table
  ;; It's basically a N+1 operation where N is the number of tables in the database
  (if (driver/database-supports? driver :table-privileges nil)
    (let [privilege-map (build-privilege-map driver conn)]
      (fn [{schema :schema table :name ttype :type} privilege]
        (assert (#{:select :write} privilege))
        ;; driver/current-user-table-privileges does not return privileges for external table on redshift, and foreign
        ;; table on postgres, so we need to use the select method on them
        ;;
        ;; TODO FIXME What the hecc!!! We should NOT be hardcoding driver-specific hacks in functions like this!!!!
        (if (#{[:postgres "FOREIGN TABLE"]}
             [driver ttype])
          (case privilege
            :select (sql-jdbc.sync.interface/have-select-privilege? driver conn schema table)
            :write  nil) ; Foreign tables typically don't support write operations
          (contains? (get-in privilege-map [schema table] #{}) privilege))))
    (let [can-check-writable?          (driver/database-supports? driver :metadata/table-writable-check {:connection conn})
          check-writable-privilege-map (when can-check-writable?
                                         (build-privilege-map driver conn))]
      (fn [{schema :schema table :name} privilege]
        (assert (#{:select :write} privilege))
        (case privilege
          :select (sql-jdbc.sync.interface/have-select-privilege? driver conn schema table)
          :write  (when can-check-writable?
                    (contains? (get-in check-writable-privilege-map [schema table] #{}) privilege)))))))

(defn fast-active-tables
  "Default, fast implementation of `active-tables` best suited for DBs with lots of system tables (like Oracle). Fetch
  list of schemas, then for each one not in `excluded-schemas`, fetch its Tables, and combine the results.

  This is as much as 15x faster for Databases with lots of system tables than `post-filtered-active-tables` (4 seconds
  vs 60)."
  [driver ^Connection conn & [db-name-or-nil schema-inclusion-filters schema-exclusion-filters]]
  {:pre [(instance? Connection conn)]}
  (let [metadata         (.getMetaData conn)
        syncable-schemas (sql-jdbc.sync.interface/filtered-syncable-schemas driver conn metadata
                                                                            schema-inclusion-filters schema-exclusion-filters)
        privilege-fn     (have-privilege-fn driver conn)]
    (eduction (mapcat (fn [schema]
                        (eduction
                         (comp (filter #(privilege-fn % :select))
                               (map (fn [table]
                                      (-> table
                                          (dissoc :type)
                                          (assoc :is_writable (privilege-fn table :write))))))
                         (db-tables driver metadata schema db-name-or-nil))))
              syncable-schemas)))

(defmethod sql-jdbc.sync.interface/active-tables :sql-jdbc
  [driver connection schema-inclusion-filters schema-exclusion-filters]
  (fast-active-tables driver connection nil schema-inclusion-filters schema-exclusion-filters))

(defn post-filtered-active-tables
  "Alternative implementation of `active-tables` best suited for DBs with little or no support for schemas. Fetch *all*
  Tables, then filter out ones whose schema is in `excluded-schemas` Clojure-side."
  [driver ^Connection conn & [db-name-or-nil schema-inclusion-filters schema-exclusion-filters]]
  {:pre [(instance? Connection conn)]}
  (let [privilege-fn (have-privilege-fn driver conn)]
    (eduction
     (comp
      (filter (let [excluded (sql-jdbc.sync.interface/excluded-schemas driver)]
                (fn [{table-schema :schema :as table}]
                  (and (not (contains? excluded table-schema))
                       (include-schema-logging-exclusion schema-inclusion-filters schema-exclusion-filters table-schema)
                       (privilege-fn table :select)))))
      (map (fn [table]
             (-> table
                 (dissoc :type)
                 (assoc :is_writable (privilege-fn table :write))))))
     (db-tables driver (.getMetaData conn) nil db-name-or-nil))))

(defn db-or-id-or-spec->database
  "Get database instance from `db-or-id-or-spec`."
  [db-or-id-or-spec]
  (cond (driver-api/instance-of? :model/Database db-or-id-or-spec)
        db-or-id-or-spec

        (int? db-or-id-or-spec)
        (driver-api/with-metadata-provider db-or-id-or-spec
          (driver-api/database (driver-api/metadata-provider)))

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
      (let [schema-filter-prop   (driver.u/find-schema-filters-prop driver)
            database             (db-or-id-or-spec->database db-or-id-or-spec)
            [inclusion-patterns
             exclusion-patterns] (when (some? schema-filter-prop)
                                   (driver.s/db-details->schema-filter-patterns (:name schema-filter-prop) database))]
        (into #{} (sql-jdbc.sync.interface/active-tables driver conn inclusion-patterns exclusion-patterns)))))})
