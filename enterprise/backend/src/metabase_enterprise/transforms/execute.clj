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
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Executors ExecutorService Future ScheduledExecutorService TimeUnit)))

(set! *warn-on-reflection* true)

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

(defn- execute-mbql-transform-remote! [run-id driver transform-details opts]
  (try
    (log/trace "starting transform run" (pr-str run-id))
    (worker/execute-transform! run-id driver transform-details opts)
    (let [;; timeout after 4 hours
          timeout-limit (+ (System/currentTimeMillis) (* 4 60 60 1000))
          wait 2000]
      (loop []
        (Thread/sleep (long (* wait (inc (- (/ (rand) 5) 0.1)))))
        (log/trace "polling for remote transform" (pr-str run-id) "after wait" wait)
        (let [result (worker/sync-single-run! run-id)]
          (when (= result :started)
            (recur)))))
    (catch Throwable t
      (log/error "Remote execution failed.")
      (worker/fail-started-run! run-id {:message (.getMessage t)})
      (throw t))))

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

(defn- execute-mbql-transform-local!
  [run-id driver transform-details opts]
  (worker/chan-start-timeout-vthread! run-id)
  ;; local run is responsible for status
  (try
    (binding [qp.pipeline/*canceled-chan* (a/promise-chan)]
      (worker/chan-start-run! run-id qp.pipeline/*canceled-chan*)
      (driver/execute-transform! driver transform-details opts))
    (worker/succeed-started-run! run-id)
    (catch Throwable t
      (worker/fail-started-run! run-id {:message (.getMessage t)})
      (throw t))
    (finally
      (worker/chan-end-run! run-id))))

(defn- execute-mbql-transform-inner! [run-id driver transform-details opts]
  (if (worker/run-remote?)
    (execute-mbql-transform-remote! run-id driver transform-details opts)
    (execute-mbql-transform-local! run-id driver transform-details opts)))

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
       (execute-mbql-transform-inner! run-id driver transform-details opts)
       (sync-target! target database run-id))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))

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
      (or (not-empty (into [] (map :work_id) (worker/inactive-runs run-ids)))
          (recur)))))

(defn execute-transforms!
  "Execute `transforms` and sync their target tables in dependency order.
  The function returns as soon as all transforms have started."
  [transforms opts]
  (let [ordering (transforms.ordering/transform-ordering transforms)
        _ (when-let [cycle (transforms.ordering/find-cycle ordering)]
            (let [id->name (into {} (map (juxt :id :name)) transforms)]
              (throw (ex-info (str "Cyclic transform definitions detected: "
                                   (str/join " → " (map id->name cycle)))
                              {:cycle cycle}))))]
    (loop [id->transform (m/index-by :id transforms)
           to-start (into #{} (map :id) transforms)
           running #{}
           complete #{}]
      (when (seq to-start)
        (if-let [available-ids (not-empty (transforms.ordering/available-transforms ordering running complete))]
          ;; there are transforms to start
          (let [{:keys [started failed]} (start-transforms! (map id->transform available-ids) opts)
                id->transform (reduce (fn [m transform]
                                        (assoc m (:id transform) transform))
                                      id->transform
                                      started)
                running' (into running (map :id) started)
                complete' (into complete (map :id) failed)
                to-start' (reduce disj to-start available-ids)
                completed (poll-transforms (map id->transform running'))]
            (recur id->transform
                   to-start'
                   (reduce disj running' completed)
                   (reduce conj complete' completed)))
          ;; nothing to start yet, poll for transforms to finish
          (if-let [completed (poll-transforms (map id->transform running))]
            (recur id->transform
                   to-start
                   (reduce disj running completed)
                   (reduce conj complete completed))
            (throw (ex-info "There are transforms to start, but nothing can be started and nothing is running!"
                            {:to-start to-start
                             :ordering ordering
                             :running  running
                             :complete complete}))))))))
