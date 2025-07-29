(ns metabase-enterprise.transforms.execute
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.sync.core :as sync]
   [toucan2.core :as t2])
  (:import
   (java.sql
    PreparedStatement)))

(set! *warn-on-reflection* true)

(comment
  (sql.qp/format-honeysql :clickhouse {:create-table-as ["dude" [:order-by :id]]
                                       :raw "select * from products"}))

(defn- sync-table!
  [database target]
  (let [table (or (transforms.util/target-table (:id database) target)
                  (sync/create-table! database (select-keys target [:schema :name])))]
    (sync/sync-table! table)))

(defn execute-transform! [{:keys [driver connection-details query primary-key output-table overwrite?]}]
  (when overwrite?
    (let [drop-table (driver/compile-drop-table driver output-table)]
      (driver/execute-raw-write-query! driver connection-details drop-table)))
  (let [create-table (driver/compile-transform driver {:query query
                                                       :output-table output-table
                                                       :primary-key primary-key})]
    {:rows-affected (driver/execute-raw-write-query! driver connection-details create-table)}))

(defn start-transform-inner!
  "Execute locally or remotely."
  [data]
  (let [worker-uri "http://localhost:3030" #_(config/config-str "transform-worker-uri")]
    (if worker-uri
      (http/post worker-uri
                 {:body data})
      (execute-transform! data))))

(defn start-transform!
  "Execute `transform` and sync its target table."
  [{:keys [source target] :as transform}]
  (let [db (get-in source [:query :database])
        {driver :engine :as database} (t2/select-one :model/Database db)
        feature (transforms.util/required-database-feature transform)]
    (when-not (driver.u/supports? driver feature database)
      (throw (ex-info "The database does not support the requested transform target type."
                      {:driver driver, :database database, :feature feature})))
    (start-transform-inner!
     {:driver driver
      :connection-details (driver/connection-details driver database)
      :query (transforms.util/compile-source source)
      :primary-key nil ;; fixme
      :output-table (transforms.util/qualified-table-name driver target)
      :overwrite? true})
    (sync-table! database target)))
