(ns metabase.driver.generic-sql.sync
  "Generic implementations of `metabase.driver` `(sync-tables [db]) function that should work across any SQL database supported by Korma."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.generic-sql.util :refer :all]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])))

(declare check-for-large-average-length korma-table field
         check-for-low-cardinality
         check-for-urls
         set-table-fks-if-needed!
         set-table-pks-if-needed!
         sync-fields-create
         sync-fields-metadata
         sync-table
         table-names
         update-table-row-count!)

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
  (with-jdbc-metadata [_ database]                                                    ; do a top-level connection to with-jdbc-metadata because it reuses connection
    (let [table-names (table-names database)                                          ; for all subsequent calls within its body
          table-name->id (sel :many :field->id [Table :name] :name [in table-names])]
      ;; Mark any existing `Table` objects not returned by `table-names` as inactive
      (dorun (map (fn [[table-name table-id]]
                    (when-not (contains? table-names table-name)
                      (upd Table table-id :active false)))
                  table-name->id))
      ;; Create `Table` objects for any new tables returned by `table-names`
      (dorun (map (fn [table-name]
                    (when-not (table-name->id table-name)
                      (ins Table
                        :db_id database-id
                        :name table-name
                        :active true)))
                  table-names))
      ;; Now sync the active Tables
      (let [tables (->> (sel :many Table :active true :db_id database-id)
                        (map #(assoc % :db (delay database))))]                       ; reuse DATABASE, that way we don't end up creating multiple connection pools
        ;; First, we need to make sure Active Fields are all up-to-date,
        ;; since other steps like set-table-fks-if-needed! depend on them existing
        (dorun (pmap (fn [table]
                       (sync-fields-create (korma-entity table) table))
                     tables))
        ;; Once those are g2g we can do the rest of the syncing for the Table
        (dorun (pmap (fn [table]
                       (let [korma-table (korma-entity table)]
                         (update-table-row-count! korma-table table)
                         (set-table-pks-if-needed! table)
                         (set-table-fks-if-needed! korma-table table)
                         (sync-fields-metadata korma-table table)))
                     tables))))))

(defn sync-table
  "Sync a single `Table` and its `Fields`."
  {:arglists '([table])}
  [{db :db table-name :name :as table}]
  (let [korma-table (korma-entity table)]          ; implementation is a little simpler here than SYNC-DATABASE
    (with-jdbc-metadata [_ @db]                    ; since we don't need to wait for *every* table to finish `sync-fields-create` before
      (sync-fields-create korma-table table)
      (update-table-row-count! korma-table table)
      (set-table-pks-if-needed! table)
      (set-table-fks-if-needed! korma-table table)
      (sync-fields-metadata korma-table table)
      (log/debug "Synced" table-name))))


(defn- sync-fields-create
  "Create new Fields for any that don't exist; mark ones that no longer exist as `inactive`."
  {:arglists '([korma-table table])}
  [korma-table {table-id :id, table-name :name, db :db}]
  (let [fields (jdbc-columns db table-name)
        field-names (set (map :column_name fields))
        field-name->id (sel :many :field->id [Field :name] :table_id table-id :name [in field-names])]
    ;; Mark any existing `Field` objects not returned by jdbc-columns as inactive
    (dorun (map (fn [[field-name field-id]]
                  (when-not (contains? field-names field-name)
                    (upd Field field-id :active false)))
                field-name->id))
    ;; Create `Field` objects for any new Fields returned by jdbc-columns
    (dorun (map (fn [{field-name :column_name type-name :type_name}]
                  (when-not (field-name->id field-name)
                    (ins Field
                      :table_id table-id
                      :name field-name
                      :base_type (or (*column->base-type* (keyword type-name))
                                     (throw (Exception. (str "Column '" field-name "' has an unknown type: '" type-name
                                                             "'. Please add the type mapping to corresponding driver (e.g. metabase.driver.postgres.sync).")))))))
                fields))))

(defn- sync-fields-metadata
  "Sync the metadata of all active fields for TABLE (in parallel)."
  {:arglists '([korma-table table])}
  [korma-table {table-id :id table-name :name}]
  (->> (sel :many Field :table_id table-id :active true)
       (pmap (fn [field]
               (try
                 (check-for-low-cardinality korma-table field)
                 (check-for-large-average-length korma-table field)
                 (check-for-urls korma-table field)
                 (catch Throwable e
                   (log/warn (format "Caught exception when syncing field '%s.%s':" table-name (:name field)) e)))))
       dorun))


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
  "Return a set of name(s) of column(s) that are primary keys for TABLE-NAME.

    (table-pk-names @test-db \"VENUES\") -> [\"ID\"]"
  [database table-name]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
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

;; ## TABLE ROW COUNT

(defn- table-row-count
  "Get the number of rows in KORMA-TABLE."
  [korma-table]
  (-> korma-table
      (select (aggregate (count :*) :count))
      first
      :count))

(defn- update-table-row-count!
  "Update the `:rows` column for TABLE with the count from `table-row-count`."
  {:arglists '([korma-table table])}
  [korma-table {:keys [id]}]
  {:pre [(integer? id)]}
  (let [new-count (table-row-count korma-table)]
    (upd Table id :rows new-count)))


;; ## SET TABLE PKS

(defn- set-table-pks-if-needed!
  "Mark primary-key `Fields` for TABLE as `special_type = id` if they don't already have a `special_type`."
  {:arglists '([table])}
  [{table-name :name table-id :id :keys [db pk_field]}]
  (->> (sel :many :fields [Field :name :id] :table_id table-id :special_type nil :name [in (table-pk-names @db table-name)])
       (map (fn [{field-name :name field-id :id}]
              (log/info (format "Field '%s.%s' is a primary key. Marking it as such." table-name field-name))
              (upd Field field-id :special_type :id)))
       dorun))


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
         dorun)))


;; ### Check for Low Cardinality

(def ^:const ^:private low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be marked with `special_type = :category`."
  40)

(defn- check-for-low-cardinality
  "Check FIELD to see if it is low cardinality and should automatically be marked as `special_type = :category`.
   This is only done for Fields that do not already have a `special_type`."
  {:arglists '([korma-table field])}
  [korma-table {field-name :name field-id :id special-type :special_type}]
  (when-not special-type
    (let [cardinality (-> korma-table
                          (select (aggregate (count (sqlfn :DISTINCT (keyword field-name))) :count))
                          first
                          :count)]
      (when (< cardinality low-cardinality-threshold)
        (log/info (format "Field '%s.%s' has %d unique values. Marking it as a category." (:table korma-table) field-name cardinality))
        (upd Field field-id :special_type :category)))))


;; ### Check For Large Avg Length

(def ^:const ^:private average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)

(defn- field-avg-length
  "Return the average length of FIELD."
  {:arglists '([korma-table field])}
  [korma-table {field-name :name}]
  (if *sql-string-length-fn*
    ;; If *sql-string-length-fn* is bound we can use just return AVG(LENGTH-FN(field))
    (-> korma-table
        (select (aggregate (avg (sqlfn* *sql-string-length-fn* (keyword field-name))) :len))
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
                    (int (math/round (/ length-sum (count values))))))))))

(defn- check-for-large-average-length
  "Check a Field to see if it has a large average length and should be marked as `preview_display = false`.
   This is only done for textual fields, i.e. ones with `special_type` of `:CharField` or `:TextField`."
  {:arglists '([korma-table field])}
  [korma-table {base-type :base_type, field-id :id, preview-display :preview_display, :as field}]
  (when (and preview-display                                 ; if field is already preview_display = false, no need to check again since there is no case
             (contains? #{:CharField :TextField} base-type)) ; where we'd end up changing it.
    (let [avg-len (field-avg-length korma-table field)]
      (when (> avg-len average-length-no-preview-threshold)
        (log/info (format "Field '%s.%s' has an average length of %d. Not displaying it in previews." (:table korma-table) (:name field) avg-len))
        (upd Field field-id :preview_display false)))))


;; ### Check for URLs

(def ^:const ^:private percent-valid-url-threshold
  "Fields that have at least this percent of values that are valid URLs should be marked as `special_type = :url`."
  0.95)

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

(defn- check-for-urls
  "Check a Field to see if the majority of its *NON-NULL* values are URLs; if so, mark it as `special_type = :url`.
   This only applies to textual fields that *do not* already have a `special_type.`"
  {:arglists '([korma-table field])}
  [korma-table {special-type :special_type, base-type :base_type, field-name :name, field-id :id, :as field}]
  (when (and (not special-type)
             (contains? #{:CharField :TextField} base-type))
    (let [percent-urls (field-percent-urls korma-table field)]
      (when (> percent-urls percent-valid-url-threshold)
        (log/info (format "Field '%s.%s' is %d%% URLs. Marking it as a URL." (:table korma-table) field-name (int (math/round (* 100 percent-urls)))))
        (upd Field field-id :special_type :url)))))
