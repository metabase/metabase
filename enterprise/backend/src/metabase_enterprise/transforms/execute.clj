(ns metabase-enterprise.transforms.execute
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.worker.core :as worker]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

;; should be run in virtual thread (please :)
(defn- run-transform-remote! [run-id driver transform-details opts]
  (try
    (log/trace "starting remote transform run" (pr-str run-id))
    (worker/run-transform! run-id driver transform-details opts)
    (catch Throwable t
      (log/error t "Remote execution request failed; still syncing")))
  ;; poll the server until it's not running
  (u.jvm/poll {:timeout-ms (* 4 60 1000 1000)
               :interval-ms (+ 2000 (- 500 (* 1000 (rand))))
               :done? #(not= "running" (:status %))
               :thunk #(worker/sync-single-run! run-id)}))

(defn- sync-target!
  ([transform-id run-id]
   (let [{:keys [source target]} (t2/select-one :model/Transform transform-id)
         db (get-in source [:query :database])
         database (t2/select-one :model/Database db)]
     (sync-target! target database run-id)))
  ([target database _run-id]
   ;; sync the new table (note that even a failed sync status means that the execution succeeded)
   (log/info "Syncing target" (pr-str target) "for transform")
   (sync-table! database target)))

(defn- run-transform-local!
  [run-id driver transform-details opts]
  (worker/chan-start-timeout-vthread! run-id)
  ;; local run is responsible for status
  (try
    (binding [qp.pipeline/*canceled-chan* (a/promise-chan)]
      (worker/chan-start-run! run-id qp.pipeline/*canceled-chan*)
      (driver/run-transform! driver transform-details opts))
    (worker/succeed-started-run! run-id)
    (catch Throwable t
      (worker/fail-started-run! run-id {:message (.getMessage t)})
      (throw t))
    (finally
      (worker/chan-end-run! run-id))))

(defn run-transform!
  "Run a compiled transform either locally or remotely."
  [run-id driver transform-details opts]
  (if (worker/run-remote?)
    (run-transform-remote! run-id driver transform-details opts)
    (run-transform-local!  run-id driver transform-details opts)))

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
           run-id (str (u/generate-nano-id))
           transform-details {:transform-type (keyword (:type target))
                              :connection-details (driver/connection-details driver database)
                              :query (transforms.util/compile-source source)
                              :output-table (transforms.util/qualified-table-name driver target)}
           opts {:overwrite? true}]
       (when-not (driver.u/supports? driver feature database)
         (throw (ex-info "The database does not support the requested transform target type."
                         {:driver driver, :database database, :feature feature})))
       ;; mark the execution as started and notify any observers
       (try
         (worker/start-run! run-id :transform id
                            {:run_method run-method
                             :is_local (not (worker/run-remote?))})
         (catch java.sql.SQLException e
           (if (= (.getSQLState e) "23505")
             (throw (ex-info "Transform is already running"
                             {:error :already-running
                              :transform-id id}
                             e))
             (throw e))))
       (when start-promise
         (deliver start-promise [:started run-id]))
       (log/info "Executing transform" id "with target" (pr-str target))
       (run-transform! run-id driver transform-details opts)
       (sync-target! target database run-id))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))
