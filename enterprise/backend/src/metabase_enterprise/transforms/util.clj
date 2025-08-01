(ns metabase-enterprise.transforms.util
  (:require
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
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

(defn target-table
  "Load the `target` table of a transform from the database specified by `database-id`."
  [database-id target & kv-args]
  (some-> (apply t2/select-one :model/Table
                 :db_id database-id
                 :schema (:schema target)
                 :name (:name target)
                 kv-args)
          (t2/hydrate :db)))

(defn- sync-table!
  ([database target] (sync-table! database target nil))
  ([database target {:keys [create?]}]
   (when-let [table (or (target-table (:id database) target)
                        (when create?
                          (sync/create-table! database (select-keys target [:schema :name]))))]
     (sync/sync-table! table)
     table)))

(defn activate-table!
  "Activate table for `target` in `database` in the app db."
  [database target]
  (when-let [table (sync-table! database target {:create? true})]
    ;; TODO this should probably be a function in the sync module
    (t2/update! :model/Table (:id table) {:active true})))

(defn deactivate-table!
  "Deactivate table for `target` in `database` in the app db."
  [database target]
  (when-let [table (sync-table! database target)]
    ;; TODO this should probably be a function in the sync module
    (t2/update! :model/Table (:id table) {:active false})))

(defn delete-target-table!
  "Delete the target table of a transform and sync it from the app db."
  [{:keys [id target source], :as _transform}]
  (when target
    (let [database-id (-> source :query :database)
          {driver :engine :as database} (t2/select-one :model/Database database-id)]
      (driver/drop-table! driver database-id (qualified-table-name driver target))
      (log/info "Deactivating  target " (pr-str target) "for transform" id)
      (deactivate-table! database target))))

(defn delete-target-table-by-id!
  "Delete the target table of the transform specified by `transform-id`."
  [transform-id]
  (delete-target-table! (t2/select-one :model/Transform transform-id)))

(defn compile-source
  "Compile the source query of a transform."
  [{query-type :type :as source}]
  (case query-type
    "query" (:query (qp.compile/compile-with-inline-parameters (:query source)))))

(defn required-database-feature
  "Returns the database feature necessary to execute `transform`."
  [transform]
  (case (-> transform :target :type)
    "table"             :transforms/table
    "view"              :transforms/view
    "materialized-view" :transforms/materialized-view))
