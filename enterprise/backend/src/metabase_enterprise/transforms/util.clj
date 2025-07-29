(ns metabase-enterprise.transforms.util
  (:require
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   [toucan2.core :as t2]))

(defn qualified-table-name
  "Return the name of the target table of a transform as a possibly qualified symbol."
  [_driver {:keys [schema name]}]
  (if schema
    (keyword schema name)
    (keyword name)))

(defn target-table-exists?
  "Test if the target table of a transform already exists."
  [{:keys [source target] :as _transform}]
  (let [db-id (-> source :query :database)
        database (t2/select-one :model/Database db-id)
        driver (:engine database)]
    (try
      (-> (driver/describe-table driver database target)
          :fields
          seq
          boolean)
      (catch Exception e
        (not (driver/table-known-to-not-exist? driver e))))))

(defn delete-target-table!
  "Delete the target table of a transform."
  [{:keys [source target] :as _transform}]
  (let [database (-> source :query :database)
        driver (t2/select-one-fn :engine :model/Database database)]
    (driver/drop-table! driver database (qualified-table-name driver target))))

(defn delete-target-table-by-id!
  "Delete the target table of the transform specified by `transform-id`."
  [transform-id]
  (delete-target-table! (t2/select-one :model/Transform transform-id)))

(defn compile-source
  "Compile the source query of a transform."
  [{query-type :type :as source}]
  (case query-type
    "query" (:query (qp.compile/compile-with-inline-parameters (:query source)))))

(defn target-table
  "Load the `target` table of a transform from the database specified by `database-id`."
  [database-id target]
  (-> (t2/select-one :model/Table
                     :db_id database-id
                     :schema (:schema target)
                     :name (:name target))
      (t2/hydrate :db)))

(defn required-database-feature
  "Returns the database feature necessary to execute `transform`."
  [transform]
  (case (-> transform :target :type)
    "table"             :transforms/table
    "view"              :transforms/view
    "materialized-view" :transforms/materialized-view))
