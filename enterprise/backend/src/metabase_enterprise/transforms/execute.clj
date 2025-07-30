(ns metabase-enterprise.transforms.execute
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.transforms.tracking :as transforms.track]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql PreparedStatement)
   (java.util.concurrent ExecutorService Executors)))

(defonce ^:private ^ExecutorService executor (Executors/newVirtualThreadPerTaskExecutor))

(def mb-id "mb-1")

(defn- sync-table!
  [database target]
  (let [table (or (transforms.util/target-table (:id database) target)
                  (sync/create-table! database (select-keys target [:schema :name])))]
    (sync/sync-table! table)))

(defn execute-inner! [{:keys [driver connection-details query primary-key output-table overwrite?] :as data}]
  (let [driver (keyword driver)
        queries (cond->> (list (driver/compile-transform driver
                                                         {:query query
                                                          :output-table output-table
                                                          :primary-key primary-key}))
                  overwrite? (cons (driver/compile-drop-table driver output-table)))]
    {:rows-affected (last (driver/execute-raw-queries! driver connection-details queries))}))

(defn execute-transform! [{:keys [work-id mb-source finally-fn] :as data}]
  (let [run-id (transforms.track/track-start! work-id "transform" mb-source)]
    (.submit executor
             ^Runnable #(try
                          (execute-inner! data)
                          (transforms.track/track-finish! run-id)
                          (catch Throwable e
                            (transforms.track/track-error! run-id)
                            (prn e))
                          (finally
                            (when finally-fn
                              (finally-fn)))))
    run-id))

(defn- worker-uri []
  (when-let [mb-transform-worker-uri (config/config-str :mb-transform-worker-uri)]
    (-> mb-transform-worker-uri
        java.net.URI.
        (.resolve "/transform")
        str)))

(defn start-transform-inner!
  "Execute locally or remotely."
  [data]
  (let [worker-uri (worker-uri)
        sourced-data (assoc data :mb-source mb-id)]
    (if worker-uri
      (http/post worker-uri {:form-params sourced-data
                             :content-type :json})
      (execute-transform! sourced-data))))

(defn start-transform!
  "Execute `transform` and sync its target table."
  [{:keys [source target id] :as transform}]
  (let [db (get-in source [:query :database])
        {driver :engine :as database} (t2/select-one :model/Database db)
        feature (transforms.util/required-database-feature transform)]
    (when-not (driver.u/supports? driver feature database)
      (throw (ex-info "The database does not support the requested transform target type."
                      {:driver driver, :database database, :feature feature})))
    (start-transform-inner!
     {:work-id id
      :driver driver
      :connection-details (driver/connection-details driver database)
      :query (transforms.util/compile-source source)
      :primary-key nil ;; fixme
      :output-table (transforms.util/qualified-table-name driver target)
      :overwrite? true})
    #_(sync-table! database target)))
