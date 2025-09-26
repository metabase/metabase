(ns metabase-enterprise.transforms.impl
  (:require
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmethod transforms.i/source-db-id :query
  [transform]
  (-> transform :source :query :database))

(defmethod transforms.i/target-db-id :query
  [transform]
  (-> transform :source :query :database))

(defmethod transforms.i/execute! :query
  [{:keys [id source target] :as transform}
   {:keys [run-method start-promise]}]
  (try
    (let [db (get-in source [:query :database])
          {driver :engine :as database} (t2/select-one :model/Database db)
          feature (transforms.util/required-database-feature transform)
          transform-details {:db-id db
                             :transform-type (keyword (:type target))
                             :conn-spec (driver/connection-spec driver database)
                             :query (transforms.util/compile-source source)
                             :output-schema (:schema target)
                             :output-table (transforms.util/qualified-table-name driver target)}
          opts {:overwrite? true}]
      (when (transforms.util/db-routing-enabled? database)
        (throw (ex-info "Transforms are not supported on databases with DB routing enabled."
                        {:driver driver, :database database})))
      (when-not (driver.u/supports? driver feature database)
        (throw (ex-info "The database does not support the requested transform target type."
                        {:driver driver, :database database, :feature feature})))
      ;; mark the execution as started and notify any observers
      (let [{run-id :id} (transforms.util/try-start-unless-already-running id run-method)]
        (when start-promise
          (deliver start-promise [:started run-id]))
        (log/info "Executing transform" id "with target" (pr-str target))
        (transforms.util/run-cancelable-transform!
         run-id driver transform-details
         (fn [_cancel-chan] (driver/run-transform! driver transform-details opts)))
        (transforms.instrumentation/with-stage-timing [run-id :table-sync]
          (transforms.util/sync-target! target database run-id))))
    (catch Throwable t
      (log/error t "Error executing transform")
      (when start-promise
        ;; if the start-promise has been delivered, this is a no-op,
        ;; but we assume nobody would catch the exception anyway
        (deliver start-promise t))
      (throw t))))
