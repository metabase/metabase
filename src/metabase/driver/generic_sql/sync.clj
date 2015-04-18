(ns metabase.driver.generic-sql.sync
  "Generic implementations of `metabase.driver` `(sync-tables [db]) function that should work across any SQL database supported by Korma."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.generic-sql.util :refer :all]
            [metabase.driver.sync :as common]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])))

(declare field-avg-length
         field-percent-urls
         jdbc-columns
         set-table-fks-if-needed!
         set-table-pks-if-needed!
         sync-fields-create
         sync-fields-metadata
         sync-table
         table-active-field-name->base-type
         table-names)

;; # PUBLIC INTERFACE

;; ## Syncing

(def ^:dynamic *column->base-type*
  "COLUMN->BASE-TYPE should be a map of column types returned by the DB to Field base types."
  {})

(def ^:dynamic *sql-string-length-fn*
  "This should be bound to the *keyword* name of the SQL fn that can be used to return the length of a string.

    (binding [*sql-string-length-fn* :LENGTH] ; for H2
      ...)"
  nil)

(defn sync-database
  "Sync all `Tables` + `Fields` in DATABASE."
  [{database-id :id :as database}]
  (with-jdbc-metadata [_ database]
    ;; Create new Tables as needed, mark old ones inactive
    (common/sync-database-create-tables database (table-names database))

    ;; Now sync the active Tables
    (common/sync-active-tables database

      ;; First, we need to make sure Active Fields are all up-to-date,
      ;; since other steps like set-table-fks-if-needed! depend on them existing
      #(common/sync-table-create-fields % (table-active-field-name->base-type %))

      ;; Once that's done we can do the rest of the syncing for Tables
      #(common/sync-table-metadata %
         :pks-fn       table-pk-names)

      #(set-table-fks-if-needed! (korma-entity %) %)

      sync-fields-metadata)))

(defn sync-table
  "Sync a single `Table` and its `Fields`."
  {:arglists '([table])}
  [{db :db table-name :name :as table}]
  (let [korma-table (korma-entity table)]          ; implementation is a little simpler here than SYNC-DATABASE
    (with-jdbc-metadata [_ @db]                    ; since we don't need to wait for *every* table to finish `sync-fields-create` before

      (common/sync-table-create-fields table (table-active-field-name->base-type table))

      (common/sync-table-metadata table
        :pks-fn       table-pk-names)

      (set-table-fks-if-needed! korma-table table)
      (sync-fields-metadata table)
      (log/debug "Synced" table-name))))

;; TODO - Fix this
;; I'm not 100% sure how I got us into this mess
;; But sometimes now a Table's :db is a delay and other times not
(defn- deref-if-delay
  "Helper to deref OBJ if it is delay, otherwise return as-is."
  [obj]
  (if (delay? obj) @obj
      obj))

(defn- table-active-field-name->base-type
  "Return a map of active `Field` names to their `base_type`, determined by passing its JDBC type to `*column->base-type*`."
  {:arglists '([table])}
  [{db :db table-name :name :as table}]
  (let [korma-table (korma-entity table)]
    (->> (jdbc-columns (deref-if-delay db) table-name)
         (map (fn [{:keys [type_name column_name]}]
                {column_name (or (*column->base-type* (keyword type_name))
                                 (do (log/warn (str "Column '" column_name "' has an unknown type: '" type_name
                                                    "'. Please add the type mapping to corresponding driver (e.g. metabase.driver.postgres.sync)."))
                                     :UnknownField))}))
         (into {}))))

(defn- sync-fields-metadata
  "Sync the metadata of all active fields for TABLE."
  [table]
  (let [korma-table (korma-entity table)]
    (common/sync-active-fields-metadata table
      :avg-length-fn   (partial field-avg-length korma-table)
      :percent-urls-fn (partial field-percent-urls korma-table))))


;; ## Metadata -- Fetch Tables/Columns/PKs/FKs from DB

(defn table-names
  "Fetch a set of table names for DATABASE."
  [database]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (->> (jdbc/result-set-seq (.getTables md nil nil nil (into-array String ["TABLE"]))) ; ResultSet getTables(String catalog, String schemaPattern, String tableNamePattern, String[] types)
         (map :table_name)
         doall
         set)))

(defn jdbc-columns
  "Fetch information about the various columns for Table with TABLE-NAME by getting JDBC metadata for DATABASE."
  [database table-name]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (->> (jdbc/result-set-seq (.getColumns md nil nil table-name nil)) ; ResultSet getColumns(String catalog, String schemaPattern, String tableNamePattern, String columnNamePattern)
         (filter #(not= (:table_schem %) "INFORMATION_SCHEMA"))        ; filter out internal DB columns. This works for H2; does it work for *other*
         (map #(select-keys % [:column_name :type_name]))              ; databases?
         doall
         set)))

(defn table-pk-names
  "Return a set of name(s) of column(s) that are primary keys for TABLE.

    (table-pk-names (sel :one Table :name \"USERS\") -> #{\"ID\", ...}"
  [{database :db table-name :name}]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md (deref-if-delay database)]
    (->> (jdbc/result-set-seq (.getPrimaryKeys md nil nil table-name)) ; ResultSet getPrimaryKeys(String catalog, String schema, String table)
         (map :column_name)
         doall
         set)))

(defn table-fks
  "Return a set of maps containing info about FK columns for TABLE-NAME.
   Each map contains the following keys:

   *  fk-column-name
   *  dest-table-name
   *  dest-column-name"
  [database table-name]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (->> (jdbc/result-set-seq (.getImportedKeys md nil nil table-name)) ; ResultSet getImportedKeys(String catalog, String schema, String table)
         (map (fn [result]
                {:fk-column-name   (:fkcolumn_name result)
                 :dest-table-name  (:pktable_name result)
                 :dest-column-name (:pkcolumn_name result)}))
         doall
         set)))


;; # IMPLEMENTATION


;; ## SET TABLE FKS

(defn- determine-fk-type
  "Determine whether `Field` named FIELD-NAME is a `1t1` or `Mt1` `ForeignKey` relationship.
   Do this by getting the count and distinct counts of this `Field`.

   *  If count and distinct count are equal, we have a one-to-one foreign key relationship.
   *  If count is > distinct count, we have a many-to-one foreign key relationship."
  [korma-table field-name]
  (let [{:keys [distinct-cnt cnt]} (first (select korma-table
                                                  (aggregate (count (sqlfn :DISTINCT (keyword field-name))) :distinct-cnt)
                                                  (aggregate (count (keyword field-name)) :cnt)))]
    (if (= cnt distinct-cnt) :1t1
        :Mt1)))

(defn- set-table-fks-if-needed!
  "Mark foreign-key `Fields` for TABLE as `special_type = fk` if they don't already have a `special_type`."
  {:arglists '([korma-table table])}
  [korma-table {database :db table-name :name table-id :id}]
  (try
    (let [fks            (table-fks @database table-name)
          fk-name->id    (sel :many :field->id [Field :name] :table_id table-id :special_type nil :name [in (map :fk-column-name fks)])
          table-name->id (sel :many :field->id [Table :name] :name [in (map :dest-table-name fks)])]
      (->> fks
           (map (fn [{:keys [fk-column-name dest-column-name dest-table-name]}]
                  (when-let [fk-column-id (fk-name->id fk-column-name)]
                    (when-let [dest-table-id (table-name->id dest-table-name)]
                      (when-let [dest-column-id (sel :one :id Field :table_id dest-table-id :name dest-column-name)]
                        (log/info (format "Marking foreign key '%s.%s' -> '%s.%s'." table-name fk-column-name dest-table-name dest-column-name))
                        (ins ForeignKey
                          :origin_id fk-column-id
                          :destination_id dest-column-id
                          :relationship (determine-fk-type korma-table fk-column-name))
                        (upd Field fk-column-id :special_type :fk))))))
           dorun))
    (catch Throwable e
      (log/error "Caught exception in set-table-fks-if-needed!:" e))))

;; ### Avg. Length, Percent URLs

(defn- field-avg-length
  "Return the average length of FIELD."
  [korma-table {field-name :name}]
  {:post [(integer? %)]}
  (int (if *sql-string-length-fn*
         ;; If *sql-string-length-fn* is bound we can use just return AVG(LENGTH-FN(field))
         (-> korma-table
             (select (aggregate (avg (sqlfn* *sql-string-length-fn*
                                             (raw (format "CAST(\"%s\" AS TEXT)" (name field-name)))))
                                :len))
             first
             :len)
         ;; Otherwise we'll have to select *all* values of the Field and sum their counts in Clojure-land
         (do (log/warn (format "WARNING: *sql-string-length-fn* is not bound for the %s driver. We cannot efficiently determine the average length of text fields."
                               (-> korma-table :db :options :subprotocol)))
             (let [values (select korma-table (fields [(keyword field-name) :value]))]
               (if-not (seq values) 0
                       (let [length-sum (->> values
                                             (map :value)
                                             (map count)
                                             (reduce +))]
                         (math/round (/ length-sum (count values))))))))))

;; TODO - this fails for postgres tables that we consider TextFields but don't work for char_length, such as UUID fields
;; This is not a big deal since we wouldn't want to mark those as URLs any way, but we should do casting here to avoid
;; that issue in the first place
(defn- field-percent-urls
  "Return the percentage of non-null values of FIELD that are valid URLS."
  {:arglists '([korma-table field])}
  [korma-table {field-name :name}]
  (let [total-non-null-count (-> (select korma-table
                                         (aggregate (count :*) :count)
                                         (where {(keyword field-name) [not= nil]})) first :count)]
    (if (= total-non-null-count 0) 0
        (let [url-count (-> (select korma-table
                                    (aggregate (count :*) :count)
                                    (where {(keyword field-name) [like "http%://_%.__%"]})) first :count)] ; This is how the old Django app worked. Didn't match URLs like
          (float (/ url-count total-non-null-count))))))                                                   ; "www.zagat.com". Is this what we want?
