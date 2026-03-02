(ns metabase.transforms-base.query
  "Query transform execution without transform_run lifecycle.
  Compiles the transform query, calls driver/run-transform!, and returns results in-memory."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.util :as driver.u]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.util]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmethod transforms-base.i/execute-base! :query
  [{:keys [source target] :as transform} opts]
  (try
    (let [db-id                          (get-in source [:query :database])
          {driver :engine :as database}  (t2/select-one :model/Database db-id)
          features                       (transforms-base.util/required-database-features transform)
          compile-source-fn              (or (:compile-source-fn opts)
                                             (throw (ex-info "execute-base! :query requires :compile-source-fn in opts" {})))]
      (when-not (every? (fn [feature] (driver.u/supports? driver feature database)) features)
        (throw (ex-info "The database does not support the requested transform target type."
                        {:driver driver, :database database, :features features})))
      (driver.conn/with-write-connection
        (let [conn-spec         (driver/connection-spec driver database)
              compiled-query    (compile-source-fn transform)
              transform-details {:db-id          db-id
                                 :database       database
                                 :transform-id   (:id transform)
                                 :transform-type (keyword (:type target))
                                 :conn-spec      conn-spec
                                 :query          compiled-query
                                 :output-schema  (:schema target)
                                 :output-table   (transforms-base.util/qualified-table-name driver target)}]
          (when-not (driver/schema-exists? driver db-id (:output-schema transform-details))
            (driver/create-schema-if-needed! driver conn-spec (:output-schema transform-details)))
          (log/info "Executing transform" (:id transform) "with target" (pr-str target)
                    (when (driver.conn/write-connection-requested?)
                      " using write connection"))
          (let [result (if-let [cancelled? (:cancelled? opts)]
                         (when-not (cancelled?)
                           (driver/run-transform! driver transform-details {}))
                         (driver/run-transform! driver transform-details {}))]
            {:status :succeeded
             :result result}))))
    (catch Throwable t
      (log/error t "Error executing transform (base)")
      {:status :failed
       :error  t})))
