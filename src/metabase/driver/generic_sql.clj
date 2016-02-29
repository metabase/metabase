(ns metabase.driver.generic-sql
  (:require [clojure.core.memoize :as memoize]
            [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            (korma [core :as k]
                   [db :as kdb])
            [metabase.driver :as driver]
            [metabase.driver.sync :as sync]
            metabase.driver.query-processor.interface
            (metabase.models [field :as field]
                             [table :as table])
            [metabase.util :as u]
            [metabase.util.korma-extensions :as kx])
  (:import java.sql.DatabaseMetaData
           java.util.Map
           clojure.lang.Keyword
           (metabase.driver.query_processor.interface Field Value)))

(declare korma-entity)

(defprotocol ISQLDriver
  "Methods SQL-based drivers should implement in order to use `IDriverSQLDefaultsMixin`.
   Methods marked *OPTIONAL* have default implementations in `ISQLDriverDefaultsMixin`."

  (active-tables ^java.util.Set [this, ^java.sql.DatabaseMetaData metadata]
    "Return a set of maps containing information about the active tables/views, collections, or equivalent that currently exist in DATABASE.
     Each map should contain the key `:name`, which is the string name of the table. For databases that have a concept of schemas,
     this map should also include the string name of the table's `:schema`.")

  ;; The following apply-* methods define how the SQL Query Processor handles given query clauses. Each method is called when a matching clause is present
  ;; in QUERY, and should return an appropriately modified version of KORMA-QUERY. Most drivers can use the default implementations for all of these methods,
  ;; but some may need to override one or more (e.g. SQL Server needs to override the behavior of `apply-limit`, since T-SQL uses `TOP` instead of `LIMIT`).
  (apply-aggregation [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-breakout    [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-fields      [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-filter      [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-join-tables [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-limit       [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-order-by    [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-page        [this korma-query, ^Map query] "*OPTIONAL*.")

  (column->base-type ^clojure.lang.Keyword [this, ^Keyword column-type]
    "Given a native DB column type, return the corresponding `Field` `base-type`.")

  (column->special-type ^clojure.lang.Keyword [this, ^String column-name, ^Keyword column-type]
    "*OPTIONAL*. Attempt to determine the special-type of a field given the column name and native type.
     For example, the Postgres driver can mark Postgres JSON type columns as `:json` special type.")

  (connection-details->spec [this, ^Map details-map]
    "Given a `Database` DETAILS-MAP, return a JDBC connection spec.")

  (current-datetime-fn [this]
    "*OPTIONAL*. Korma form that should be used to get the current `DATETIME` (or equivalent). Defaults to `(k/sqlfn* :NOW)`.")

  (date [this, ^Keyword unit, field-or-value]
    "Return a korma form for truncating a date or timestamp field or value to a given resolution, or extracting a date component.")

  (excluded-schemas ^java.util.Set [this]
    "*OPTIONAL*. Set of string names of schemas to skip syncing tables from.")

  (field->alias ^String [this, ^Field field]
    "*OPTIONAL*. Return the alias that should be used to for FIELD, i.e. in an `AS` clause. The default implementation calls `name`, which
     returns the *unqualified* name of `Field`.

     Return `nil` to prevent FIELD from being aliased.")

  (get-connection-for-sync ^java.sql.Connection [this details]
    "*OPTIONAL*. Get a connection used for a Sync step. By default, this returns a pooled connection.")

  (prepare-value [this, ^Value value]
    "*OPTIONAL*. Prepare a value (e.g. a `String` or `Integer`) that will be used in a korma form. By default, this returns VALUE's `:value` as-is, which
     is eventually passed as a parameter in a prepared statement. Drivers such as BigQuery that don't support prepared statements can skip this
     behavior by returning a korma `raw` form instead, or other drivers can perform custom type conversion as appropriate.")

  (set-timezone-sql ^String [this]
    "*OPTIONAL*. This should be a prepared JDBC SQL statement string to be used to set the timezone for the current transaction.

       \"SET @@session.timezone = ?;\"")

  (stddev-fn ^clojure.lang.Keyword [this]
    "*OPTIONAL*. Keyword name of the SQL function that should be used to do a standard deviation aggregation. Defaults to `:STDDEV`.")

  (string-length-fn ^clojure.lang.Keyword [this]
    "Keyword name of the SQL function that should be used to get the length of a string, e.g. `:LENGTH`.")

  (unix-timestamp->timestamp [this, field-or-value, ^Keyword seconds-or-milliseconds]
    "Return a korma form appropriate for converting a Unix timestamp integer field or value to an proper SQL `Timestamp`.
     SECONDS-OR-MILLISECONDS refers to the resolution of the int in question and with be either `:seconds` or `:milliseconds`."))


(def ^{:arglists '([connection-spec])}
  connection-spec->pooled-connection-spec
  "Return a JDBC connection spec that includes a cp30 `ComboPooledDataSource`.
   Theses connection pools are cached so we don't create multiple ones to the same DB.
   Pools are destroyed after they aren't used for more than 3 hours."
  (memoize/ttl
   (fn [spec]
     (log/debug (u/format-color 'magenta "Creating new connection pool..."))
     (kdb/connection-pool (assoc spec :minimum-pool-size           1
                                      ;; prevent broken connections closed by dbs by testing them every 3 mins
                                      :idle-connection-test-period (* 3 60)
                                      ;; prevent overly large pools by condensing them when connections are idle for 15m+
                                      :excess-timeout              (* 15 60))))
   :ttl/threshold (* 6 60 60 1000)))

(defn db->jdbc-connection-spec
  "Return a JDBC connection spec for DATABASE. Normally this will have a C3P0 pool as its datasource, unless the database is `short-lived`."
  {:arglists '([database] [driver details])}
  ;; TODO - I don't think short-lived? key is really needed anymore. It's only used by unit tests, and its original purpose was for creating temporary DBs;
  ;; since we don't destroy databases at the end of each test anymore, it's probably time to remove this
  ([{:keys [engine details]}]
   (db->jdbc-connection-spec (driver/engine->driver engine) details))
  ([driver {:keys [short-lived?], :as details}]
   (let [connection-spec (connection-details->spec driver details)]
     (if short-lived?
       connection-spec
       (connection-spec->pooled-connection-spec connection-spec)))))

(def ^{:arglists '([database] [driver details])}
  db->connection
  "Return a [possibly pooled] connection to DATABASE. Make sure to close this when you're done! (e.g. by using `with-open`)"
  (comp jdbc/get-connection db->jdbc-connection-spec))


(defn escape-field-name
  "Escape dots in a field name so Korma doesn't get confused and separate them. Returns a keyword."
  ^clojure.lang.Keyword [k]
  (keyword (kx/escape-name (name k))))


(defn- can-connect? [driver details]
  (let [connection (connection-details->spec driver details)]
    (= 1 (-> (k/exec-raw connection "SELECT 1" :results)
             first
             vals
             first))))

(defn pattern-based-column->base-type
  "Return a `column->base-type` function that matches types based on a sequence of pattern / base-type pairs."
  [pattern->type]
  (fn [_ column-type]
    (let [column-type (name column-type)]
      (loop [[[pattern base-type] & more] pattern->type]
        (cond
          (re-find pattern column-type) base-type
          (seq more)                    (recur more))))))

(defn- field-values-lazy-seq [driver field]
  (let [table           (field/table field)
        name-components (field/qualified-name-components field)
        transform-fn    (if (contains? #{:TextField :CharField} (:base_type field))
                          u/jdbc-clob->str
                          identity)

        field-k         (keyword (:name field))
        select*         (-> (k/select* (korma-entity table))
                            (k/fields (escape-field-name field-k)))
        fetch-one-page  (fn [page-num]
                          (for [row (k/exec (apply-page driver select* {:page {:items driver/field-values-lazy-seq-chunk-size, :page page-num}}))]
                            (transform-fn (row field-k))))

        ;; This function returns a chunked lazy seq that will fetch some range of results, e.g. 0 - 500, then concat that chunk of results
        ;; with a recursive call to (lazily) fetch the next chunk of results, until we run out of results or hit the limit.
        fetch-page      (fn -fetch-page [page-num]
                          (lazy-seq
                           (let [results             (fetch-one-page page-num)
                                 total-items-fetched (* (inc page-num) driver/field-values-lazy-seq-chunk-size)]
                             (concat results (when (and (seq results)
                                                        (< total-items-fetched driver/max-sync-lazy-seq-results)
                                                        (= (count results) driver/field-values-lazy-seq-chunk-size))
                                               (-fetch-page (inc page-num)))))))]
    (fetch-page 0)))

(defn- table-rows-seq [_ database table]
  (k/select (korma-entity database table)))

(defn- field-avg-length [driver field]
  (or (some-> (korma-entity (field/table field))
              (k/select (k/aggregate (avg (k/sqlfn* (string-length-fn driver)
                                                    ;; TODO: multi-byte data on postgres causes exception
                                                    (kx/cast :CHAR (escape-field-name (:name field)))))
                                     :len))
              first
              :len
              int)
      0))

(defn- field-percent-urls [_ field]
  (or (let [korma-table (korma-entity (field/table field))]
        (when-let [total-non-null-count (:count (first (k/select korma-table
                                                                 (k/aggregate (count (k/raw "*")) :count)
                                                                 (k/where {(escape-field-name (:name field)) [not= nil]}))))]
          (when (> total-non-null-count 0)
            (when-let [url-count (:count (first (k/select korma-table
                                                          (k/aggregate (count (k/raw "*")) :count)
                                                          (k/where {(escape-field-name (:name field)) [like "http%://_%.__%"]}))))]
              (float (/ url-count total-non-null-count))))))
      0.0))

(defn features
  "Default implementation of `IDriver` `features` for SQL drivers."
  [driver]
  (set (cond-> [:foreign-keys
                :standard-deviation-aggregations]
         (set-timezone-sql driver) (conj :set-timezone))))


;;; ## Database introspection methods used by sync process

(defmacro with-metadata
  "Execute BODY with `java.sql.DatabaseMetaData` for DATABASE."
  [[binding driver database] & body]
  `(with-open [^java.sql.Connection conn# (get-connection-for-sync ~driver (:details ~database))]
     (let [~binding (.getMetaData conn#)]
       ~@body)))

(defn fast-active-tables
  "Default, fast implementation of `IDriver/active-tables` best suited for DBs with lots of system tables (like Oracle).
   Fetch list of schemas, then for each one not in `excluded-schemas`, fetch its Tables, and combine the results.

   This is as much as 15x faster for Databases with lots of system tables than `post-filtered-active-tables` (4 seconds vs 60)."
  [driver, ^DatabaseMetaData metadata]
  (let [all-schemas (set (map :table_schem (jdbc/result-set-seq (.getSchemas metadata))))
        schemas     (set/difference all-schemas (excluded-schemas driver))]
    (set (for [schema     schemas
               table-name (mapv :table_name (jdbc/result-set-seq (.getTables metadata nil schema nil (into-array String ["TABLE", "VIEW"]))))]
           {:name   table-name
            :schema schema}))))

(defn post-filtered-active-tables
  "Alternative implementation of `IDriver/active-tables` best suited for DBs with little or no support for schemas.
   Fetch *all* Tables, then filter out ones whose schema is in `excluded-schemas` Clojure-side."
  [driver, ^DatabaseMetaData metadata]
  (set (for [table (filter #(not (contains? (excluded-schemas driver) (:table_schem %)))
                           (jdbc/result-set-seq (.getTables metadata nil nil nil (into-array String ["TABLE", "VIEW"]))))]
         {:name   (:table_name table)
          :schema (:table_schem table)})))

(defn- describe-table-fields
  [^DatabaseMetaData metadata, driver, {:keys [schema name]}]
  (set (for [{:keys [column_name type_name]} (jdbc/result-set-seq (.getColumns metadata nil schema name nil))
             :let [calculated-special-type (column->special-type driver column_name (keyword type_name))]]
         (merge {:name        column_name
                 :custom      {:column-type type_name}
                 :base-type   (or (column->base-type driver (keyword type_name))
                                  (do (log/warn (format "Don't know how to map column type '%s' to a Field base_type, falling back to :UnknownField." type_name))
                                      :UnknownField))}
                (when calculated-special-type
                  {:special-type calculated-special-type})))))

(defn- add-table-pks
  [^DatabaseMetaData metadata, table]
  (let [pks (->> (.getPrimaryKeys metadata nil nil (:name table))
                 jdbc/result-set-seq
                 (mapv :column_name)
                 set)]
    (update table :fields (fn [fields]
                            (set (for [field fields]
                                   (if-not (contains? pks (:name field)) field
                                                                         (assoc field :pk? true))))))))

(defn- describe-database [driver database]
  (with-metadata [metadata driver database]
    {:tables (active-tables driver, ^DatabaseMetaData metadata)}))

(defn- describe-table [driver table]
  (with-metadata [metadata driver (table/database table)]
    (->> (assoc (select-keys table [:name :schema]) :fields (describe-table-fields metadata driver table))
         ;; find PKs and mark them
         (add-table-pks metadata))))

(defn- describe-table-fks [driver table]
  (with-metadata [metadata driver (table/database table)]
    (set (->> (.getImportedKeys metadata nil nil (:name table))
              jdbc/result-set-seq
              (mapv (fn [result]
                      {:fk-column-name   (:fkcolumn_name result)
                       :dest-table       {:name   (:pktable_name result)
                                          :schema (:pktable_schem result)}
                       :dest-column-name (:pkcolumn_name result)}))))))


(defn analyze-table
  "Default implementation of `analyze-table` for SQL drivers."
  [driver table new-table-ids]
  ((sync/make-analyze-table driver
                            :field-avg-length-fn   (partial field-avg-length driver)
                            :field-percent-urls-fn (partial field-percent-urls driver))
   driver
   table
   new-table-ids))


(defn ISQLDriverDefaultsMixin
  "Default implementations for methods in `ISQLDriver`."
  []
  (require 'metabase.driver.generic-sql.query-processor)
  {:active-tables           fast-active-tables
   :apply-aggregation       (resolve 'metabase.driver.generic-sql.query-processor/apply-aggregation) ; don't resolve the vars yet so during interactive dev if the
   :apply-breakout          (resolve 'metabase.driver.generic-sql.query-processor/apply-breakout) ; underlying impl changes we won't have to reload all the drivers
   :apply-fields            (resolve 'metabase.driver.generic-sql.query-processor/apply-fields)
   :apply-filter            (resolve 'metabase.driver.generic-sql.query-processor/apply-filter)
   :apply-join-tables       (resolve 'metabase.driver.generic-sql.query-processor/apply-join-tables)
   :apply-limit             (resolve 'metabase.driver.generic-sql.query-processor/apply-limit)
   :apply-order-by          (resolve 'metabase.driver.generic-sql.query-processor/apply-order-by)
   :apply-page              (resolve 'metabase.driver.generic-sql.query-processor/apply-page)
   :column->special-type    (constantly nil)
   :current-datetime-fn     (constantly (k/sqlfn* :NOW))
   :excluded-schemas        (constantly nil)
   :field->alias            (u/drop-first-arg name)
   :get-connection-for-sync db->connection
   :prepare-value           (u/drop-first-arg :value)
   :set-timezone-sql        (constantly nil)
   :stddev-fn               (constantly :STDDEV)})


(defn IDriverSQLDefaultsMixin
  "Default implementations of methods in `IDriver` for SQL drivers."
  []
  (require 'metabase.driver.generic-sql.native
           'metabase.driver.generic-sql.query-processor)
  (merge driver/IDriverDefaultsMixin
         {:analyze-table         analyze-table
          :can-connect?          can-connect?
          :describe-database     describe-database
          :describe-table        describe-table
          :describe-table-fks    describe-table-fks
          :features              features
          :field-values-lazy-seq field-values-lazy-seq
          :process-native        (resolve 'metabase.driver.generic-sql.native/process-and-run)
          :process-structured    (resolve 'metabase.driver.generic-sql.query-processor/process-structured)
          :table-rows-seq        table-rows-seq}))



;;; ### Util Fns

(defn- db->korma-db
  "Return a Korma DB spec for Metabase DATABASE."
  ([database]
   (db->korma-db (driver/engine->driver (:engine database)) (:details database)))
  ([driver details]
   (assoc (kx/create-db (connection-details->spec driver details))
          :pool (db->jdbc-connection-spec driver details))))

(defn- table+db->entity [{schema :schema, table-name :name} db]
  (k/database (kx/create-entity [schema table-name]) db))

(defn korma-entity
  "Return a Korma entity for [DB and] TABLE.

    (-> (sel :one Table :id 100)
        korma-entity
        (select (aggregate (count :*) :count)))"
  ([table]
   (korma-entity (table/database table) table))

  ([db table]             (table+db->entity table (db->korma-db db)))
  ([driver details table] (table+db->entity table (db->korma-db driver details))))
