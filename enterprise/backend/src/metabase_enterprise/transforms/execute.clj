(ns metabase-enterprise.transforms.execute
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn execute-query!
  "Execute the `sql` query with `params` on the database specified by `db-ref` using `driver`."
  [driver db-ref [sql & params] opts]
  (let [query {:native (cond-> {:query sql}
                         params (assoc :params params))
               :type :native
               :database db-ref}]
    (qp.setup/with-qp-setup [query query]
      (let [query (qp.preprocess/preprocess query)]
        (driver/execute-transform! driver query opts)))))

(defn execute!
  "Execute a transform lego piece."
  [{:keys [db-ref driver sql output-table overwrite?]}]
  (let [output-table (keyword (or output-table (str "transform_" (str/replace (random-uuid) \- \_))))
        query (driver/compile-transform driver {:sql sql :output-table output-table :overwrite? overwrite?})]
    (execute-query! driver db-ref query
                    {:before-queries [(when overwrite?
                                        (driver/compile-drop-table driver output-table))]})
    output-table))

(defn- sync-table!
  [database target]
  (let [table (or (transforms.util/target-table (:id database) target)
                  (sync/create-table! database (select-keys target [:schema :name])))]
    (sync/sync-table! table)))

(defn exec-transform
  "Execute `transform` and sync its target table.

  This is executing anything synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform] (exec-transform transform nil))
  ([{:keys [id source target] :as transform} {:keys [start-promise]}]
   (try
     (let [db (get-in source [:query :database])
           {driver :engine :as database} (t2/select-one :model/Database db)
           feature (transforms.util/required-database-feature transform)]
       (when-not (driver.u/supports? driver feature database)
         (throw (ex-info "The database does not support the requested transform target type."
                         {:driver driver, :database database, :feature feature})))
       ;; mark the execution as started and notify any observers
       (when (zero? (t2/update! :model/Transform id
                                :execution_status [:!= :started]
                                {:last_started_at :%now
                                 :execution_status :started}))
         (throw (ex-info "The transform is running (or missing)." {:transform-id id})))
       ;; remove the live table if it's not our target anymore
       (when (not= (:target transform) (:live_target transform))
         (transforms.util/delete-live-target-table! transform))
       (when start-promise
         (deliver start-promise :started))
       ;; start the execution for real
       (try
         (execute!
          {:db-ref db
           :driver driver
           :sql (transforms.util/compile-source source)
           :output-table (transforms.util/qualified-table-name driver target)
           :overwrite? true})
         (t2/update! :model/Transform id {:live_target (assoc target :database (-> source :query :database))
                                          :execution_status :exec-succeeded
                                          :last_ended_at :%now})
         (catch Throwable t
           (t2/update! :model/Transform id {:execution_status :exec-failed
                                            :last_ended_at :%now})
           (throw t)))
       ;; sync the new table (note that even a failed sync status means that the execution succeeded)
       (try
         (sync-table! database target)
         (t2/update! :model/Transform id
                     :execution_status [:= :exec-succeeded]
                     {:execution_status :sync-succeeded})
         (catch Throwable t
           (t2/update! :model/Transform id
                       :execution_status [:= :exec-succeeded]
                       {:execution_status :sync-failed})
           (throw t))))
     (catch Throwable t
       (log/error t "Error executing transform")
       (if start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t)
         (throw t))))))
