(ns metabase-enterprise.transforms.execute
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase-enterprise.transforms.sync :as transforms.sync]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.worker.core :as worker]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.sync.core :as sync]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Executors ExecutorService Future ScheduledExecutorService TimeUnit)))

(set! *warn-on-reflection* true)

(defonce ^:private ^ScheduledExecutorService scheduler (Executors/newScheduledThreadPool 1))

(defonce ^:private ^ExecutorService executor (Executors/newVirtualThreadPerTaskExecutor))

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
    (worker/execute-transform! run-id driver transform-details opts)
    (catch Throwable t
      (log/error "Remote execution failed.")
      (t2/update! :model/WorkerRun run-id
                  :status :started
                  {:status :exec-failed
                   :end_time :%now
                   :is_active nil
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
     (t2/update! :model/WorkerRun
                 :run_id run-id
                 :status [:= :exec-succeeded]
                 {:status :sync-started})
     (sync-table! database target)
     (t2/update! :model/WorkerRun
                 :run_id run-id
                 :status [:= :sync-started]
                 {:status :sync-succeeded})
     (catch Throwable t
       (log/error "Syncing target" (pr-str target) "failed.")
       (t2/update! :model/WorkerRun
                   :run_id run-id
                   :status [:= :sync-started]
                   {:status :sync-failed})
       (throw t)))))

;; register that we need to run sync after a transform is finished remotely
(defmethod transforms.sync/post-success :transform
  [{:keys [run_id work_id]}]
  (sync-target! work_id run_id))

(defonce ^:private connections (atom {}))

(defn cancel-run! [run-id]
  (when-some [cancel-chan (a/promise-chan) #_(get @connections run-id)]
    (swap! connections dissoc run-id)
    (a/put! cancel-chan :cancel!)
    (t2/update! :model/WorkerRun
                :run_id run-id
                [:or
                 [:= :status "started"]
                 [:= :status "canceling"]] true
                {:status :canceled
                 :end_time :%now
                 :is_active nil
                 :message "Canceled by user"})))

(defn mark-cancel-run! [run-id]
  (t2/update! :model/WorkerRun
              :run_id run-id
              :status "started"
              {:status :canceling
               :end_time :%now
               :message "Canceled by user"}))

(defn- execute-mbl-transform-local!
  [run-id driver transform-details opts]
  ;; local run is responsible for status

  ;; start a timeout vthread
  (.submit executor ^Runnable (fn []
                                (Thread/sleep (* 4 60 60 1000)) ;; 4 hours
                                (when-some [cancel-chan (get @connections run-id)]
                                  (swap! connections dissoc run-id)
                                  (a/put! cancel-chan :cancel!)
                                  (t2/update! :model/WorkerRun
                                              :run_id run-id
                                              :status "started"
                                              {:status :timeout
                                               :end_time :%now
                                               :is_active nil
                                               :message "Timed out"}))))
  (try
    (binding [qp.pipeline/*canceled-chan* (a/promise-chan)]
      (swap! connections assoc run-id qp.pipeline/*canceled-chan*)
      (driver/execute-transform! driver transform-details opts))
    (when (get @connections run-id)
      (swap! connections dissoc run-id)
      (t2/update! :model/WorkerRun
                  :run_id run-id
                  {:status :exec-succeeded
                   :end_time :%now
                   :is_active nil}))
    (catch Throwable t
      (t2/update! :model/WorkerRun
                  :run_id run-id
                  {:status :exec-failed
                   :end-time :%now
                   :is_active nil
                   :message (.getMessage t)})
      (throw t))))

(defn execute-mbql-transform!
  "Execute `transform` and sync its target table.

  This is executing synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform] (execute-mbql-transform! transform nil))
  ([{:keys [id source target] :as transform} {:keys [run-method start-promise]}]
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
       ;; mark the execution as started and notify any observers
       (try
         (t2/insert! :model/WorkerRun
                     {:run_id run-id
                      :work_id id
                      :work_type :transform
                      :run_method run-method
                      :is_local (not (worker/run-remote?))
                      :status :started
                      :is_active true})
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
       (if (worker/run-remote?)
         (execute-mbl-transform-remote! run-id driver transform-details opts)
         (do
           (execute-mbl-transform-local! run-id driver transform-details opts)
           (sync-target! target database run-id))))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))

(comment
  (t2/insert! :model/WorkerRun
              {:run_id (str (random-uuid))
               :work_id 1
               :work_type :transform
               :run_method :remote
               :is_local true
               :status :started
               :is_active true})
  (sync-worker-runs!)
  -)

(def ^:private ^Long scheduled-execution-poll-delay-millis 2000)

(defn- start-transforms!
  [transforms opts]
  (let [started-transforms
        (mapv (fn [transform]
                (let [start-promise (promise)]
                  (try
                    (let [thunk (^:once fn []
                                  (execute-mbql-transform! transform (assoc opts :start-promise start-promise)))]
                      (.submit executor ^Runnable (bound-fn* thunk)))
                    (catch Throwable t
                      (deliver start-promise t)))
                  [transform start-promise]))
              transforms)]
    (reduce (fn [done [transform start-promise]]
              (let [result @start-promise
                    run-id (when (and (vector? result) (= (first result) :started))
                             (second result))]
                (if run-id
                  (update done :started conj (assoc transform ::run-id run-id))
                  (update done :failed  conj transform))))
            {:started []
             :failed  []}
            started-transforms)))

(defn- poll-transforms
  [transforms]
  (when-let [run-ids (seq (keep ::run-id transforms))]
    (loop []
      (Thread/sleep scheduled-execution-poll-delay-millis)
      (or (not-empty (t2/select-fn-vec :work_id :model/WorkerRun
                                       :run_id [:in run-ids]
                                       :status [:!= :started]))
          (recur)))))

(defn execute-transforms!
  "Execute `transforms` and sync their target tables in dependency order."
  [transforms opts]
  (let [ordering (transforms.ordering/transform-ordering transforms)
        _ (when-let [cycle (transforms.ordering/find-cycle ordering)]
            (let [id->name (into {} (map (juxt :id :name)) transforms)]
              (throw (ex-info (str "Cyclic transform definitions detected: "
                                   (str/join " → " (map id->name cycle)))
                              {:cycle cycle}))))
        id->transform (m/index-by :id transforms)]
    (loop [to-start (into #{} (map :id) transforms)
           running #{}
           complete #{}]
      (when (seq to-start)
        (if-let [available-ids (not-empty (transforms.ordering/available-transforms ordering running complete))]
          ;; there are transforms to start
          (let [{:keys [started failed]} (start-transforms! (map id->transform available-ids) opts)
                running' (into running (map :id) started)
                complete' (into complete (map :id) failed)
                to-start' (reduce disj to-start available-ids)
                completed (poll-transforms (map id->transform running'))]
            (recur to-start'
                   (reduce disj running' completed)
                   (reduce conj complete' completed)))
          ;; nothing to start yet, poll for transforms to finish
          (if-let [completed (poll-transforms (map id->transform running))]
            (recur to-start
                   (reduce disj running completed)
                   (reduce conj complete completed))
            (throw (ex-info "There are transforms to start, but nothing can be started and nothing is running!"
                            {:to-start to-start
                             :ordering ordering
                             :running  running
                             :complete complete}))))))))

;; TODO (eric)
;;
;; Can I do this?
(defmethod task/init! ::CancelLostRuns [_]
  (.scheduleAtFixedRate scheduler
                        #(try
                           (log/trace "Checking for canceling items.")
                           (let [runs (t2/reducible-select :model/WorkerRun
                                                           :is_local true
                                                           :status "canceling")]
                             (reduce (fn [_ run]
                                       (try
                                         (cancel-run! (:run_id run))
                                         (catch Throwable t
                                           (log/error t (str "Error canceling " (:run_id run))))))
                                     nil runs))
                           (catch Throwable t
                             (log/error t "Error while canceling on worker."))) 0 20 TimeUnit/SECONDS))
