(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.worker.core :as worker]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private mb-id "mb-1")

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :view :table]]
   [:connection-details :any]
   [:query :string]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

(defn- sync-table!
  [database target]
  (let [table (or (transforms.util/target-table (:id database) target)
                  (sync/create-table! database (select-keys target [:schema :name])))]
    (sync/sync-table! table)))

(defn- execute-mbl-transform-remote! [run-id driver transform-details opts]
  (try
    (worker/execute-transform! mb-id run-id driver transform-details opts)
    (catch Throwable t
      (log/error "Remote execution failed.")
      (t2/update! :model/WorkerRun run-id
                  :status :started
                  {:status :exec-failed
                   :end_time :%now
                   :message (.getMessage t)})
      (throw t))))

(defn- sync-target!
  ([transform-id run-id]
   (let [{:keys [source target]} (t2/select-one :model/Transform transform-id)
         db (get-in source [:query :database])
         database (t2/select-one :model/Database db)]
     (sync-target! target database run-id)))
  ([target database run-id]
   ;; sync the new table (note that even a failed sync status means that the execution succeeded)
   (try
     (log/info "Syncing target" (pr-str target) "for transform")
     (t2/update! :model/WorkerRun run-id
                 :status [:= :exec-succeeded]
                 {:status :sync-started})
     (sync-table! database target)
     (t2/update! :model/WorkerRun run-id
                 :status [:= :sync-started]
                 {:status :sync-succeeded})
     (catch Throwable t
       (log/error "Syncing target" (pr-str target) "failed.")
       (t2/update! :model/WorkerRun run-id
                   :status [:= :sync-started]
                   {:status :sync-failed})
       (throw t)))))

;; register that we need to run sync after a transform is finished remotely
(defmethod worker/post-success :transform
  [{:keys [run_id work_id]}]
  (sync-target! work_id run_id))

(defn- execute-mbl-transform-local!
  [run-id driver transform-details opts]
  ;; local run is responsible for status
  (try
    (driver/execute-transform! driver transform-details opts)
    (t2/update! :model/WorkerRun run-id
                {:status :exec-succeeded
                 :end_time :%now})
    (catch Throwable t
      (t2/update! :model/WorkerRun run-id
                  {:status :exec-failed
                   :end-time :%now
                   :message (.getMessage t)})
      (throw t))))

(defn execute-mbql-transform!
  "Execute `transform` and sync its target table.

  This is executing anything synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform] (execute-mbql-transform! transform nil))
  ([{:keys [id source target] :as transform} {:keys [run-method]}]
   (try
     (let [db (get-in source [:query :database])
           {driver :engine :as database} (t2/select-one :model/Database db)
           feature (transforms.util/required-database-feature transform)
           run-id (str (random-uuid))
           transform-details {:transform-type (keyword (:type target))
                              :connection-details (driver/connection-details driver database)
                              :query (transforms.util/compile-source source)
                              :output-table (transforms.util/qualified-table-name driver target)}
           opts {:overwrite? true}]
       (when-not (driver.u/supports? driver feature database)
         (throw (ex-info "The database does not support the requested transform target type."
                         {:driver driver, :database database, :feature feature})))
       ;; TODO: Check if it's already running
       ;; mark the execution as started and notify any observers
       (t2/insert! :model/WorkerRun
                   {:run_id run-id
                    :work_id id
                    :work_type :transform
                    :run_method run-method
                    :is_local (not (worker/run-remote?))
                    :status :started})
       (log/info "Executing transform" id "with target" (pr-str target))
       (if (worker/run-remote?)
         (execute-mbl-transform-remote! run-id driver transform-details opts)
         (do
           (execute-mbl-transform-local! run-id driver transform-details opts)
           (sync-target! target database run-id))))
     (catch Throwable t
       (log/error t "Error executing transform")
       (throw t)))))

(comment

  (t2/insert! :model/WorkerRun
              {:run_id (str (random-uuid))
               :work_id 1
               :work_type :transform
               :run_method :remote
               :is_local true
               :status :started})
  (sync-worker-runs!))
