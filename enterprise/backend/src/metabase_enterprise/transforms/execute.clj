(ns metabase-enterprise.transforms.execute
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.sync.core :as sync]
   [toucan2.core :as t2]))

(defn execute-query!
  "Execute the `sql` query with `params` on the database specified by `db-ref` using `driver`."
  [driver db-ref [sql & params]]
  (let [query {:native (cond-> {:query sql}
                         params (assoc :params params))
               :type :native
               :database db-ref}]
    (qp.setup/with-qp-setup [query query]
      (let [query (qp.preprocess/preprocess query)]
        (driver/execute-write-query! driver query)))))

(defn execute!
  "Execute a transform lego piece."
  [{:keys [db-ref driver sql output-table overwrite?]}]
  (let [output-table (keyword (or output-table (str "transform_" (str/replace (random-uuid) \- \_))))
        query (driver/compile-transform driver {:sql sql :output-table output-table :overwrite? overwrite?})]
    (when overwrite?
      (execute-query! driver db-ref (driver/compile-drop-table driver output-table)))
    (execute-query! driver db-ref query)
    output-table))

(defn- sync-table!
  [database target]
  (let [table (or (transforms.util/target-table (:id database) target)
                  (sync/create-table! database {:schema (:schema target)
                                                :name (:table target)}))]
    (sync/sync-table! table)))

(defn exec-transform
  "Execute `transform` and sync its target table."
  [transform]
  (let [{:keys [source target]} transform
        db (get-in source [:query :database])
        {driver :engine :as database} (t2/select-one :model/Database db)
        feature (transforms.util/required-database-feature transform)]
    (when-not (driver.u/supports? driver feature database)
      (throw (ex-info "The database does not support the requested transform target type."
                      {:driver driver, :database database, :feature feature})))
    (execute!
     {:db-ref db
      :driver driver
      :sql (transforms.util/compile-source source)
      :output-table (transforms.util/qualified-table-name driver target)
      :overwrite? true})
    (sync-table! database target)))
