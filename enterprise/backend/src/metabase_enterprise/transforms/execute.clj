(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::transform-details
  [:map
   [:db-id :int]
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table]]
   [:query :string]
   [:target :any]
   [:conn-spec :any]])

(defn run-mbql-transform!
  "Run `transform` and sync its target table.

  This is executing synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform] (run-mbql-transform! transform nil))
  ([{:keys [id source target] :as transform} {:keys [run-method start-promise]}]
   (try
     (let [db (get-in source [:query :database])
           {driver :engine :as database} (t2/select-one :model/Database db)
           feature (transforms.util/required-database-feature transform)
           transform-details {:db-id db
                              :transform-type (keyword (:type target))
                              :query (transforms.util/compile-source source)
                              :target target
                              :conn-spec (driver/connection-spec driver database)}]
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
         (transforms.util/sync-target! target database run-id)))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))
