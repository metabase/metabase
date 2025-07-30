(ns metabase-enterprise.transforms.execute
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.core :as sync]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private mb-id "mb-1")

(defn- sync-table!
  [database target]
  (let [table (or (transforms.util/target-table (:id database) target)
                  (sync/create-table! database (select-keys target [:schema :name])))]
    (sync/sync-table! table)))

(defn execute-transform!
  "Executes a query transform. "
  [{:keys [driver connection-details query primary-key output-table overwrite?] :as _data}]
  (let [driver (keyword driver)
        queries (cond->> (list (driver/compile-transform driver
                                                         {:query query
                                                          :output-table output-table
                                                          :primary-key primary-key}))
                  overwrite? (cons (driver/compile-drop-table driver output-table)))]
    {:rows-affected (last (driver/execute-raw-queries! driver connection-details queries))}))

(defn- worker-uri []
  (config/config-str :mb-transform-worker-uri))

(defn- worker-route [^String path]
  (when-let [base-uri (worker-uri)]
    (-> base-uri
        java.net.URI.
        (.resolve path)
        str)))

(defn execute-mbql-transform-remote!
  "Execute a transform on a remote worker."
  [data]
  (log/info "executing remote transform" (pr-str (:work-id data)))
  (let [{:keys [body]} (http/post (worker-route "/transform")
                                  {:form-params data
                                   :content-type :json})
        {:keys [run-id]} (json/decode+kw body)
        ;; timeout after 1 hour
        timeout-limit (+ (System/currentTimeMillis) (* 60 60 1000))
        wait 2000]
    (loop []
      (Thread/sleep wait)
      (log/trace "polling for remote transform" (pr-str (:work-id data)) "after wait" wait)
      (let [{poll-body :body} (http/get (worker-route (str "/transform/" run-id)))]
        (case poll-body
          "running" (if (> (System/currentTimeMillis) timeout-limit)
                      (throw (ex-info "Remote execution of transform timed out"
                                      {:transform data}))
                      (recur))
          ("success" "error") nil
          (throw (ex-info (str "Unrecognized status response from remote worker: " poll-body)
                          {:transform data})))))))

(defn execute-mbql-transform-local!
  "Execute a transform on locally."
  [data]
  (execute-transform! data))

(defn execute-mbql-transform-inner!
  "Execute locally or remotely."
  [data]
  (let [worker-uri (worker-uri)
        sourced-data (assoc data :mb-source mb-id)]
    (if worker-uri
      (execute-mbql-transform-remote! sourced-data)
      (execute-mbql-transform-local! sourced-data))))

(defn execute-mbql-transform!
  "Execute `transform` and sync its target table.

  This is executing anything synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform] (execute-mbql-transform! transform nil))
  ([{:keys [id source target] :as transform} {:keys [start-promise]}]
   (try
     (let [db (get-in source [:query :database])
           {driver :engine :as database} (t2/select-one :model/Database db)
           feature (transforms.util/required-database-feature transform)
           live-target (:live_target transform)]
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
       (when (and live-target
                  (not= target live-target))
         (log/info "Deleting old target table" (pr-str live-target))
         (transforms.util/delete-live-target-table! transform)
         (when-let [table (transforms.util/target-table (:id database) live-target)]
           ;; there is a metabase table, sync it away
           (log/info "Syncing away old target table" (->  table (select-keys [:db_id :id :schema :name]) pr-str))
           (sync/sync-table! table)))
       (when start-promise
         (deliver start-promise :started))
       ;; start the execution for real
       (try
         (log/info "Executing transform" id "with target" (pr-str target))
         (execute-mbql-transform-inner!
          {:work-id id
           :driver driver
           :connection-details (driver/connection-details driver database)
           :query (transforms.util/compile-source source)
           :primary-key nil ;; fixme
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
         (log/info "Syncing target" (pr-str target) "for transform" id)
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
