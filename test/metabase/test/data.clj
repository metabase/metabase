(ns metabase.test.data
  "Code related to creating and deleting test databases + datasets."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
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
            (load-table-data! dataset-loader database-definition table-definition))

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
  (cascade-delete (metabase-instance database-definition (engine dataset-loader)))

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


;; ## TODO! with-temp-table and related macros

;; DEPRECATED ! Need to rewrite this to use the new TableDefinition stuff
;; (defmacro with-temp-table
;;   "Execute BODY with a temporary Table that will be dropped afterward.
;;    The korma entity representing the Table is bound to TABLE-BINDING.
;;    FIELDS-MAP should be a map of FIELD-NAME -> SQL-TYPE.

;;     (with-temp-table [table {:name \"VARCHAR(254)\"}]
;;       (insert table (values [{:name \"A\"}
;;                              {:name \"B\"}]))
;;       (select table values (where {:name \"A\"})))"
;;   [[table-binding fields-map] & body]
;;   {:pre [(map? fields-map)]}
;;   (let [table-name (name (gensym "TABLE__"))
;;         formatted-fields (->> fields-map
;;                               (map (fn [[field-name field-type]]
;;                                      (format "\"%s\" %s" (.toUpperCase ^String (name field-name)) (name field-type))))
;;                               (interpose ", ")
;;                               (reduce str))]
;;     `(do (get-or-create-database! (h2/dataset-loader) data/test-data)
;;          (h2/exec-sql data/test-data (format "DROP TABLE IF EXISTS \"%s\";" ~table-name))
;;          (h2/exec-sql data/test-data (format "CREATE TABLE \"%s\" (%s, \"ID\" BIGINT AUTO_INCREMENT, PRIMARY KEY (\"ID\"));" ~table-name ~formatted-fields))
;;          (let [~table-binding (h2/korma-entity (map->TableDefinition {:table-name ~table-name})
;;                                                data/test-data)]
;;            (try
;;              ~@body
;;              (catch Throwable e#
;;                (println "E: " e#))
;;              (finally
;;                (h2/exec-sql data/test-data (format "DROP TABLE \"%s\";" ~table-name))))))))
