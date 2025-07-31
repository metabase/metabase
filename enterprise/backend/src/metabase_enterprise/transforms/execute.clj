(ns metabase-enterprise.transforms.execute
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
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

(defn- worker-uri []
  (config/config-str :mb-transform-worker-uri))

(defn- worker-route [^String path]
  (when-let [base-uri (worker-uri)]
    (-> base-uri
        java.net.URI.
        (.resolve path)
        str)))

(defn- json-body [{:keys [body]}]
  (json/decode+kw body))

(defn execute-mbql-transform-remote!
  "Execute a transform on a remote worker."
  [driver transform-details opts]
  (log/info "executing remote transform")
  (let [mb-source mb-id
        {:keys [run-id]} (json-body (http/put (worker-route "/transform")
                                              {:form-params {:driver driver
                                                             :transform-details transform-details
                                                             :opts opts
                                                             :mb-source mb-source}
                                               :content-type :json}))
        ;; timeout after 4 hours
        timeout-limit (+ (System/currentTimeMillis) (* 4 60 60 1000))
        wait 2000]
    (log/info "started transform execution" (pr-str run-id))
    (loop []
      (Thread/sleep (long (* wait (inc (- (/ (rand) 5) 0.1)))))
      (log/trace "polling for remote transform" (pr-str run-id) "after wait" wait)
      (let [{:keys [status]} (json-body (http/get (worker-route (str "/status/" run-id))))]
        (case status
          "running"
          (if (> (System/currentTimeMillis) timeout-limit)
            (throw (ex-info "Remote execution of transform timed out"
                            {:transform-details transform-details}))
            (recur))

          "success"
          (do (log/info "remote transform execution" (pr-str run-id) "succeeded")
              nil)

          "error"
          (throw (ex-info (str "Remote execution of" (pr-str run-id) " failed.")
                          {:transform-details transform-details}))

          (throw (ex-info (str "Unrecognized status response from remote worker: " status)
                          {:transform-details transform-details})))))))

(mu/defn execute-mbql-transform-inner!
  "Execute locally or remotely."
  [driver :- :keyword
   transform-details :- ::transform-details
   opts :- ::transform-opts]
  (let [worker-uri (worker-uri)]
    (if worker-uri
      (execute-mbql-transform-remote! driver transform-details opts)
      (driver/execute-transform! driver transform-details opts))))

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
       (when start-promise
         (deliver start-promise :started))
       ;; start the execution for real
       (try
         (log/info "Executing transform" id "with target" (pr-str target))
         (println (u/pprint-to-str transform))
         (execute-mbql-transform-inner!
          driver
          {:transform-type (keyword (:type target))
           :connection-details (driver/connection-details driver database)
           :query (transforms.util/compile-source source)
           :output-table (transforms.util/qualified-table-name driver target)}
          {:overwrite? true})
         (t2/update! :model/Transform id {:execution_status :exec-succeeded
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
