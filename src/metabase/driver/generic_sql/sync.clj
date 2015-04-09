(ns metabase.driver.generic-sql.sync
  "Generic implementations of `metabase.driver` `(sync-tables [db]) function that should work across any SQL database supported by Korma."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.generic-sql.util :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])))

(declare check-for-large-average-length korma-table field
         check-for-low-cardinality
         check-for-urls
         set-table-pks-if-needed!
         sync-fields
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

(defn sync-table
  "Sync a single `Table` and its `Fields`."
  {:arglists '([table])}
  [{db :db table-name :name :as table}]
  (with-jdbc-metadata [_ @db]
    (let [korma-table (korma-entity table)]
      (update-table-row-count! korma-table table)
      (sync-fields korma-table table))
    (set-table-pks-if-needed! table)
    (log/debug "Synced" table-name)))

(defn sync-database
  "Sync all `Tables` + `Fields` in DATABASE."
  [{:keys [id] :as database}]
  (with-jdbc-metadata [_ database]                                                             ; with-jdbc-metadata reuses *jdbc-metadata* in any call to it inside its body
    (->> (table-names database)                                                                ; by wrapping the entire sync operation in this we can reuse the same connection throughout
         (pmap (fn [table-name]
                 (binding [*entity-overrides* {:transforms [#(assoc % :db (delay database))]}] ; add a korma transform to Table that will assoc :db on results.
                   (sync-table (or (sel :one Table :db_id id :name table-name)                 ; Table's post-select only sets :db if it's not already set.
                                   (ins Table                                                  ; This way, we can reuse a single `database` instead of creating
                                     :db_id id                                                 ; a few dozen duplicate instances of it.
                                     :name table-name                                          ; We can re-use one korma connection pool instead of creating a new one for each
                                     :active true))))))                                        ; Table, which collapses when we open too many connections
         dorun)))


;; ## Fetch Tables/Columns/PKs from DB

(defn table-names
  "Fetch a list of table names for DATABASE."
  [database]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (->> (jdbc/result-set-seq (.getTables md nil nil nil (into-array String ["TABLE"]))) ; ResultSet getTables(String catalog, String schemaPattern, String tableNamePattern, String[] types)
         (map :table_name)
         doall)))


(defn jdbc-columns
  "Fetch information about the various columns for Table with TABLE-NAME by getting JDBC metadata for DATABASE."
  [database table-name]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (->> (jdbc/result-set-seq (.getColumns md nil nil table-name nil)) ; ResultSet getColumns(String catalog, String schemaPattern, String tableNamePattern, String columnNamePattern)
         (filter #(not= (:table_schem %) "INFORMATION_SCHEMA"))        ; filter out internal DB columns. This works for H2; does it work for *other*
         (map #(select-keys % [:column_name :type_name]))              ; databases?
         doall)))

(defn table-pk-names
  "Return a set of name(s) of column(s) that are primary keys for TABLE-NAME.

    (table-pk-names @test-db \"VENUES\") -> [\"ID\"]"
  [database table-name]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (->> (jdbc/result-set-seq (.getPrimaryKeys md nil nil table-name)) ; ResultSet getPrimaryKeys
         (map :column_name)
         doall
         set)))


;; # IMPLEMENTATION

;; ## TABLE ROW COUNT

(defn- get-table-row-count
  "Get the number of rows in KORMA-TABLE."
  [korma-table]
  (-> korma-table
      (select (aggregate (count :*) :count))
      first
      :count))

(defn- update-table-row-count!
  "Update the `:rows` column for TABLE with the count from `get-table-row-count`."
  [korma-table {:keys [id]}]
  {:pre [(integer? id)]}
  (let [new-count (get-table-row-count korma-table)]
    (upd Table id :rows new-count)))


;; ## SET TABLE PK

(defn- set-table-pks-if-needed!
  "If TABLE does not already "
  {:arglists '([table])}
  [{table-name :name table-id :id :keys [db pk_field]}]
  (->> (sel :many :fields [Field :name :id] :table_id table-id :special_type nil :name [in (table-pk-names @db table-name)])
       (map (fn [{field-name :name field-id :id}]
              (println (format "Field '%s.%s' is a primary key. Marking it as such." table-name field-name))
              (upd Field field-id :special_type :id)))
       dorun))


;; ## SYNC-FIELDS

(defn- sync-fields
  "Sync `Fields` for TABLE (in parallel)."
  [korma-table {table-id :id, table-name :name, db :db}]
  (->> (jdbc-columns db table-name)
       (pmap (fn [{:keys [type_name column_name]}]
               (or (sel :one Field :table_id table-id :name column_name)
                   (ins Field
                     :table_id table-id
                     :name column_name
                     :base_type (or (*column->base-type* (keyword type_name))
                                    (throw (Exception. (str "Column '" column_name "' has an unknown type: '" type_name
                                                            "'. Please add the type mapping to corresponding driver (e.g. metabase.driver.postgres.sync)."))))))))
       (pmap (fn [field]
               (try
                 (check-for-low-cardinality korma-table field)
                 (check-for-large-average-length korma-table field)
                 (check-for-urls korma-table field)
                 (catch Throwable e
                   (log/warn (format "Caught exception when syncing field '%s.%s':" table-name (:name field)) e)))))
       dorun))


;; ### Check for Low Cardinality

(def ^:const ^:private low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be marked with `special_type = :category`."
  40)

(defn- check-for-low-cardinality
  "Check a Field to see if it is low cardinality and should automatically be marked as `special_type = :category`.
   This is only done for Fields that do not already have a `special_type`."
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
  [korma-table {special-type :special_type, base-type :base_type, field-name :name, field-id :id, :as field}]
  (when (and (not special-type)
             (contains? #{:CharField :TextField} base-type))
    (let [percent-urls (field-percent-urls korma-table field)]
      (when (> percent-urls percent-valid-url-threshold)
        (log/info (format "Field '%s.%s' is %d%% URLs. Marking it as a URL." (:table korma-table) field-name (int (math/round (* 100 percent-urls)))))
        (upd Field field-id :special_type :url)))))
