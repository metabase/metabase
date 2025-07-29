(ns metabase-enterprise.transforms.execute
  (:require
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

(defn execute-query-low-level!
  [driver connection-details sql]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   connection-details
   nil
   (fn [^java.sql.Connection source-conn]
     (with-open [stmt (sql-jdbc.execute/statement-or-prepared-statement driver
                                                                        source-conn
                                                                        sql
                                                                        nil
                                                                        nil)]
       (if (instance? PreparedStatement stmt)
         (.executeUpdate ^PreparedStatement stmt)
         (.executeUpdate stmt sql))))))

(defn execute-query!
  [driver db-id sql]
  (let [db (t2/select-one :model/Database db-id)
        connection-details (sql-jdbc.conn/connection-details->spec
                            driver (:details db))]
    (execute-query-low-level! driver connection-details sql)))

(defn execute-low-level!
  "Execute the `sql` query  on the database specified by `connection-details` using `driver`."
  [{:keys [connection-details
           driver
           sql
           primary-key
           output-table
           overwrite?]}]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   connection-details
   nil
   (fn [^java.sql.Connection source-conn]
     (when overwrite?
       (let [drop-table (first (driver/compile-drop-table driver output-table))]
         (with-open [stmt (sql-jdbc.execute/statement-or-prepared-statement driver
                                                                            source-conn
                                                                            drop-table
                                                                            nil
                                                                            nil)]
           (if (instance? PreparedStatement stmt)
             (.executeUpdate ^PreparedStatement stmt)
             (.executeUpdate stmt sql)))))
     (let [create-table (first (driver/compile-transform driver {:sql sql :output-table output-table :primary-key primary-key}))]
       (with-open [stmt (sql-jdbc.execute/statement-or-prepared-statement driver
                                                                          source-conn
                                                                          create-table
                                                                          nil
                                                                          nil)]
         {:rows-affected (if (instance? PreparedStatement stmt)
                           (.executeUpdate ^PreparedStatement stmt)
                           (.executeUpdate stmt sql))})))))

(comment
  (sql.qp/format-honeysql :clickhouse {:create-table-as ["dude" [:order-by :id]]
                                       :raw "select * from products"}))

(defn data-for-transform
  "Transform a map including `:db-id` to one that includes `:connection-details` and `:driver`."
  [{:keys [db-id] :as data}]
  (let [db (t2/select-one :model/Database db-id)
        driver (:engine db)
        connection-details (sql-jdbc.conn/connection-details->spec
                            driver (:details db))]
    (-> data
        (dissoc :db-id)
        (assoc :connection-details connection-details)
        (assoc :driver driver))))

(defn execute-remote!
  [{:keys [output-table] :as data}]
  (let [output-table (keyword (or output-table (str "transform_" (str/replace (random-uuid) \- \_))))
        data (data-for-transform (-> data
                                     (assoc :output-table output-table)))]
    (config/config-str "transform-worker-uri")
    #_(send-request-remove-server data)))

(defn execute-in-process!
  "Execute a transform lego piece."
  [{:keys [output-table] :as data}]
  (let [output-table (keyword (or output-table (str "transform_" (str/replace (random-uuid) \- \_))))]
    (execute-low-level! (data-for-transform (-> data
                                                (assoc :output-table output-table))))
    output-table))

(defn- sync-table!
  [database target]
  (let [table (or (transforms.util/target-table (:id database) target)
                  (sync/create-table! database (select-keys target [:schema :name])))]
    (sync/sync-table! table)))

(defn execute!
  "Execute locally or remotely."
  [data]
  (if (config/config-str "transform-worker-uri")
    (execute-remote! data)
    (execute-in-process! data)))

(defn exec-transform-mbql
  "Execute `transform` and sync its target table."
  [{:keys [source target] :as transform}]
  (let [db (get-in source [:query :database])
        {driver :engine :as database} (t2/select-one :model/Database db)
        feature (transforms.util/required-database-feature transform)]
    (when-not (driver.u/supports? driver feature database)
      (throw (ex-info "The database does not support the requested transform target type."
                      {:driver driver, :database database, :feature feature})))
    (execute-in-process!
     {:db-id db
      :driver driver
      :sql (transforms.util/compile-source source)
      :output-table (transforms.util/qualified-table-name driver target)
      :overwrite? true})
    (sync-table! database target)))
