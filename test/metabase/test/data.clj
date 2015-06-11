(ns metabase.test.data
  "Code related to creating and deleting test databases + datasets."
  (:require (clojure [string :as s]
                     [walk :as walk])
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [medley.core :as m]
            (metabase [db :refer :all]
                      [driver :as driver])
            (metabase.models [database :refer [Database]]
                             [field :refer [Field] :as field]
                             [table :refer [Table]])
            (metabase.test.data [data :as data]
                                [h2 :as h2]
                                [interface :refer :all]))
  (:import clojure.lang.Keyword
           (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

;; ## Loading / Deleting Test Datasets

(defn get-or-create-database!
  "Create DBMS database associated with DATABASE-DEFINITION, create corresponding Metabase `Databases`/`Tables`/`Fields`, and sync the `Database`.
   DATASET-LOADER should be an object that implements `IDatasetLoader`."
  [dataset-loader {:keys [database-name], :as ^DatabaseDefinition database-definition}]
  (let [engine (engine dataset-loader)]
    (or (metabase-instance database-definition engine)
        (do
          ;; Create the database
          (log/info (color/blue (format "Creating %s database %s..." (name engine) database-name)))
          (create-physical-db! dataset-loader database-definition)

          ;; Load data
          (log/info (color/blue "Loading data..."))
          (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
            (log/info (color/blue (format "Loading data for table '%s'..." (:table-name table-definition))))
            (load-table-data! dataset-loader database-definition table-definition)
            (log/info (color/blue (format "Inserted %d rows." (count (:rows table-definition))))))

          ;; Add DB object to Metabase DB
          (log/info (color/blue "Adding DB to Metabase..."))
          (let [db (ins Database
                     :name    database-name
                     :engine  (name engine)
                     :details (database->connection-details dataset-loader database-definition))]

            ;; Sync the database
            (log/info (color/blue "Syncing DB..."))
            (driver/sync-database! db)

            ;; Add extra metadata like Field field-type, base-type, etc.
            (log/info (color/blue "Adding schema metadata..."))
            (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
              (let [table-name (:table-name table-definition)
                    table      (delay (let [table (metabase-instance table-definition db)]
                                        (assert table)
                                        table))]
                (doseq [{:keys [field-name field-type special-type], :as field-definition} (:field-definitions table-definition)]
                  (let [field (delay (let [field (metabase-instance field-definition @table)]
                                       (assert field)
                                       field))]
                    (when field-type
                      (log/info (format "SET FIELD TYPE %s.%s -> %s" table-name field-name field-type))
                      (upd Field (:id @field) :field_type (name field-type)))
                    (when special-type
                      (log/info (format "SET SPECIAL TYPE %s.%s -> %s" table-name field-name special-type))
                      (upd Field (:id @field) :special_type (name special-type)))))))

            (log/info (color/blue "Finished."))
            db)))))

(defn remove-database!
  "Delete Metabase `Database`, `Fields` and `Tables` associated with DATABASE-DEFINITION, then remove the physical database from the associated DBMS.
   DATASET-LOADER should be an object that implements `IDatasetLoader`."
  [dataset-loader ^DatabaseDefinition database-definition]
  ;; Delete the Metabase Database and associated objects
  (cascade-delete Database :id (:id (metabase-instance database-definition (engine dataset-loader))))

    ;; now delete the DBMS database
  (drop-physical-db! dataset-loader database-definition))


;; ## Helper Functions for Using the Default (H2) Dataset For Writing Tests

(def test-db
  "The test `Database` object."
  (delay (get-or-create-database! (h2/dataset-loader) data/test-data)))

(def db-id
  "The ID of the test `Database`."
  (delay (assert @test-db)
         (:id @test-db)))

(def ^{:arglists '([[table-name]])}
  table->id
  "Return the ID of a Table with TABLE-NAME.

    (table->id :venues) -> 12"
  (memoize
   (fn [table-name]
     {:pre [(keyword? table-name)]
      :post [(integer? %)
             (not (zero? %))]}
     (sel :one :id Table :name (s/upper-case (name table-name)), :db_id @db-id))))

(def ^{:arglists '([table-name field-name])}
  field->id
  "Return the ID of a Field with FIELD-NAME belonging to Table with TABLE-NAME.

    (field->id :checkins :venue_id) -> 4"
  (memoize
   (fn [table-name field-name]
     {:pre [(keyword? table-name)
            (keyword? field-name)]
      :post [(integer? %)
             (not (zero? %))]}
     (sel :one :id Field :name (s/upper-case (name field-name)), :table_id (table->id table-name)))))

(defn table-name->table
  "Fetch `Table` with TABLE-NAME."
  [table-name]
  {:pre [(keyword? table-name)]
   :post [(map? %)]}
  (sel :one Table :id (table->id (s/upper-case (name table-name)))))


;; ## Temporary Dataset Macros

;; The following functions are used internally by with-temp-db to implement easy Table/Field lookup
;; with `$table` and `$table.field` forms.

(defn- table-id->field-name->field
  "Return a map of lowercased `Field` names -> fields for `Table` with TABLE-ID."
  [table-id]
  (->> (sel :many :field->obj [Field :name] :table_id table-id)
       (m/map-keys s/lower-case)))

(defn- db-id->table-name->table
  "Return a map of lowercased `Table` names -> Tables for `Database` with DATABASE-ID.
   Add a delay `:field-name->field` to each Table that calls `table-id->field-name->field` for that Table."
  [database-id]
  (->> (sel :many :field->obj [Table :name] :db_id database-id)
       (m/map-keys s/lower-case)
       (m/map-vals (fn [table]
                     (assoc table :field-name->field (delay (table-id->field-name->field (:id table))))))))

(defn -temp-db-add-getter-delay
  "Add a delay `:table-name->table` to DB that calls `db-id->table-name->table`."
  [db]
  (assoc db :table-name->table (delay (db-id->table-name->table (:id db)))))

(defn -temp-get
  "Internal - don't call this directly.
   With two args, fetch `Table` with TABLE-NAME using `:table-name->table` delay on TEMP-DB.
   With three args, fetch `Field` with FIELD-NAME by recursively fetching `Table` and using its `:field-name->field` delay."
  ([temp-db table-name]
   {:pre [(map? temp-db)
          (string? table-name)]}
   (@(:table-name->table temp-db) table-name))
  ([temp-db table-name field-name]
   {:pre [(string? field-name)]}
   (@(:field-name->field (-temp-get temp-db table-name)) field-name)))

(defn- walk-expand-&
  "Walk BODY looking for symbols like `&table` or `&table.field` and expand them to appropriate `-temp-get` forms."
  [db-binding body]
  (walk/prewalk
   (fn [form]
     (or (when (symbol? form)
           (when-let [symbol-name (re-matches #"^&.+$" (name form))]
             `(-temp-get ~db-binding ~@(-> symbol-name
                                           (s/replace #"&" "")
                                           (s/split #"\.")))))
         form))
   body))

(defmacro with-temp-db
  "Load and sync DATABASE-DEFINITION with DATASET-LOADER and execute BODY with
   the newly created `Database` bound to DB-BINDING.
   Remove `Database` and destroy data afterward.

   Within BODY, symbols like `&table` and `&table.field` will be expanded into function calls to
   fetch corresponding `Tables` and `Fields`. These are accessed via lazily-created maps of
   Table/Field names to the objects themselves. To facilitate mutli-driver tests, these names are lowercased.

     (with-temp-db [db (h2/dataset-loader) us-history-1607-to-1774]
       (driver/process-quiery {:database (:id db)
                               :type     :query
                               :query    {:source_table (:id &events)
                                          :aggregation  [\"count\"]
                                          :filter       [\"<\" (:id &events.timestamp) \"1765-01-01\"]}}))"
  [[db-binding dataset-loader ^DatabaseDefinition database-definition] & body]
  `(let [loader# ~dataset-loader
         ;; Add :short-lived? to the database definition so dataset loaders can use different connection options if desired
         dbdef# (map->DatabaseDefinition (assoc ~database-definition :short-lived? true))]
     (try
       (remove-database! loader# dbdef#)                              ; Remove DB if it already exists for some weird reason
       (let [~db-binding (-> (get-or-create-database! loader# dbdef#)
                             -temp-db-add-getter-delay)]              ; Add the :table-name->table delay used by -temp-get
         ~@(walk-expand-& db-binding body))                           ; expand $table and $table.field forms into -temp-get calls
       (finally
         (remove-database! loader# dbdef#)))))
