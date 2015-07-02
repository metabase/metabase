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
                                [datasets :as datasets :refer [*dataset*]]
                                [h2 :as h2]
                                [interface :refer :all]))
  (:import clojure.lang.Keyword
           (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

;; ## Dataset-Independent Data Fns
;; These functions offer a generic way to get bits of info like Table + Field IDs from any of our
;; many driver/dataset combos. Internally, these call the implementations of the current dataset, which
;; is bound to *dataset*. By default, this is bound to the Generic SQL Default Dataset; you can swap it
;; put with the macro `with-dataset`.
;;
;; A suite of macros exist in `metabase.test.data.datasets` that let you write a unit test once and have
;; it run against many drivers. The take care of establishing the correct bindings; you can use these
;; functions seamlessly when writing such tests.
(defn id
  "Return the ID of a `Table` or `Field` for the current driver data set."
  ([table-name]
   {:pre [*dataset*
          (keyword? table-name)]
    :post [(integer? %)]}
   (datasets/table-name->id *dataset* table-name))
  ([table-name field-name]
   {:pre [*dataset*
          (keyword? table-name)
          (keyword? field-name)]
    :post [(integer? %)]}
   (datasets/field-name->id *dataset* table-name field-name)))

(defn db []
  {:pre [*dataset*]
   :post [(map? %)]}
  (datasets/db *dataset*))

(defn db-id []
  {:pre  [*dataset*]
   :post [(integer? %)]}
  (:id (datasets/db *dataset*)))

;; (defn fetch-table [table-name]
;;   {:pre [*dataset*
;;          (keyword? table-name)]
;;    :post [(map? %)]}
;;   (datasets/table-name->table *dataset* table-name))

(defn fks-supported? []
  (datasets/fks-supported? *dataset*))

(defn format-name [name]
  (datasets/format-name *dataset* name))

(defn id-field-type []
  (datasets/id-field-type *dataset*))

(defn timestamp-field-type []
  (datasets/timestamp-field-type *dataset*))

(defn dataset-loader []
  (datasets/dataset-loader *dataset*))


;; ## Loading / Deleting Test Datasets

(defn get-or-create-database!
  "Create DBMS database associated with DATABASE-DEFINITION, create corresponding Metabase `Databases`/`Tables`/`Fields`, and sync the `Database`.
   DATASET-LOADER should be an object that implements `IDatasetLoader`; it defaults to the value returned by the method `dataset-loader` for the
   current dataset (`*dataset*`), which is H2 by default."
  ([^DatabaseDefinition database-definition]
   (get-or-create-database! (dataset-loader) database-definition))
  ([dataset-loader {:keys [database-name], :as ^DatabaseDefinition database-definition}]
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
             db))))))

(defn remove-database!
  "Delete Metabase `Database`, `Fields` and `Tables` associated with DATABASE-DEFINITION, then remove the physical database from the associated DBMS.
   DATASET-LOADER should be an object that implements `IDatasetLoader`; by default it is the value returned by the method `dataset-loader` for the
   current dataset, bound to `*dataset*`."
  ([^DatabaseDefinition database-definition]
   (remove-database! (dataset-loader) database-definition))
  ([dataset-loader ^DatabaseDefinition database-definition]
   ;; Delete the Metabase Database and associated objects
   (cascade-delete Database :id (:id (metabase-instance database-definition (engine dataset-loader))))

   ;; now delete the DBMS database
   (drop-physical-db! dataset-loader database-definition)))


;; ## Temporary Dataset Macros

;; The following functions are used internally by with-temp-db to implement easy Table/Field lookup
;; with `$table` and `$table.field` forms.

(defn- table-id->field-name->field
  "Return a map of lowercased `Field` names -> fields for `Table` with TABLE-ID."
  [table-id]
  (->> (sel :many :field->obj [Field :name], :table_id table-id, :parent_id nil)
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
   (@(:field-name->field (-temp-get temp-db table-name)) field-name))
  ([temp-db table-name parent-field-name & nested-field-names]
   {:pre [(string? (last nested-field-names))]}
   (sel :one :id Field, :name (last nested-field-names), :parent_id (:id (apply -temp-get temp-db table-name parent-field-name (butlast nested-field-names))))))

(defn- walk-expand-&
  "Walk BODY looking for symbols like `&table` or `&table.field` and expand them to appropriate `-temp-get` forms.
   If symbol ends in a `:field` form, wrap the call to `-temp-get` in call in a keyword getter for that field.

    &sightings      -> (-temp-get db \"sightings\")
    &cities.name    -> (-temp-get db \"cities\" \"name\")
    &cities.name:id -> (:id (-temp-get db \"cities\" \"name\"))"
  [db-binding body]
  (walk/prewalk
   (fn [form]
     (or (when (symbol? form)
           (when-let [[_ table-name field-name prop-name] (re-matches #"^&([^.:]+)(?:\.([^.:]+))?(?::([^.:]+))?$" (name form))]
             (let [temp-get `(-temp-get ~db-binding ~table-name ~@(when field-name [field-name]))]
               (if prop-name `(~(keyword prop-name) ~temp-get)
                   temp-get))))
         form))
   body))

(defn with-temp-db* [loader ^DatabaseDefinition dbdef f]
  (let [dbdef (map->DatabaseDefinition (assoc dbdef :short-lived? true))]
    (try
      (remove-database! loader dbdef)
      (let [db (-> (get-or-create-database! loader dbdef)
                   -temp-db-add-getter-delay)]
        (assert db)
        (assert (exists? Database :id (:id db)))
        (f db))
      (finally
        (remove-database! loader dbdef)))))

(defmacro with-temp-db
  "Load and sync DATABASE-DEFINITION with DATASET-LOADER and execute BODY with
   the newly created `Database` bound to DB-BINDING.
   Remove `Database` and destroy data afterward.

   Within BODY, symbols like `&table` and `&table.field` will be expanded into function calls to
   fetch corresponding `Tables` and `Fields`. Symbols like `&table:id` wrap a getter around the resulting
   forms (see `walk-expand-&` for details).

   These are accessed via lazily-created maps of Table/Field names to the objects themselves.
   To facilitate mutli-driver tests, these names are lowercased.

     (with-temp-db [db (h2/dataset-loader) us-history-1607-to-1774]
       (driver/process-quiery {:database (:id db)
                               :type     :query
                               :query    {:source_table (:id &events)
                                          :aggregation  [\"count\"]
                                          :filter       [\"<\" (:id &events.timestamp) \"1765-01-01\"]}}))"
  [[db-binding dataset-loader ^DatabaseDefinition database-definition] & body]
  `(with-temp-db* ~dataset-loader ~database-definition
     (fn [~db-binding]
       ~@(walk-expand-& db-binding body))))
