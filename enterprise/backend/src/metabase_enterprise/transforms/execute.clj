(ns metabase-enterprise.transforms.execute
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.transforms.canceling :as canceling]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as schema.common]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table]]
   [:conn-spec :any]
   [:query :string]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

(defn- sync-target!
  ([transform-id run-id]
   (let [{:keys [source target]} (t2/select-one :model/Transform transform-id)
         db (get-in source [:query :database])
         database (t2/select-one :model/Database db)]
     (sync-target! target database run-id)))
  ([target database _run-id]
   ;; sync the new table (note that even a failed sync status means that the execution succeeded)
   (log/info "Syncing target" (pr-str target) "for transform")
   (transforms.util/activate-table-and-mark-computed! database target)))

(defn- run-transform!
  "Run a compiled transform"
  [run-id driver {:keys [db-id conn-spec output-schema] :as transform-details} opts]
  ;; local run is responsible for status
  (try
    (when-not (driver/schema-exists? driver db-id output-schema)
      (driver/create-schema-if-needed! driver conn-spec output-schema))
    (canceling/chan-start-timeout-vthread! run-id (transforms.settings/transform-timeout))
    (binding [qp.pipeline/*canceled-chan* (a/promise-chan)]
      (canceling/chan-start-run! run-id qp.pipeline/*canceled-chan*)
      (driver/run-transform! driver transform-details opts))
    (transform-run/succeed-started-run! run-id)
    (catch Throwable t
      (transform-run/fail-started-run! run-id {:message (.getMessage t)})
      (throw t))
    (finally
      (canceling/chan-end-run! run-id))))

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
                              :transform-id   id
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
       (let [{run-id :id} (try
                            (transform-run/start-run! id {:run_method run-method})
                            (catch java.sql.SQLException e
                              (if (= (.getSQLState e) "23505")
                                (throw (ex-info "Transform is already running"
                                                {:error :already-running
                                                 :transform-id id}
                                                e))
                                (throw e))))]
         (when start-promise
           (deliver start-promise [:started run-id]))
         (log/info "Executing transform" id "with target" (pr-str target))
         (run-transform! run-id driver transform-details opts)
         (sync-target! target database run-id)
         ;; This event must be published only after the sync is complete - the new table needs to be in AppDB.
         (events/publish-event! :event/transform-run-complete {:object transform-details})))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))
