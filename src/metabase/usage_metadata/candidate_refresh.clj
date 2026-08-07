(ns metabase.usage-metadata.candidate-refresh
  "Lifecycle and cluster coordination for persisted candidate refreshes."
  (:require
   [java-time.api :as t]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.candidate-snapshot :as snapshot]
   [metabase.usage-metadata.models.candidate]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:const algorithm-version
  "Version of persisted candidate materialization behavior."
  1)

(def ^:private queued-run-startup-grace (t/minutes 5))
(defonce ^{:doc "Run ids currently executing in this process."}
  locally-running-run-ids (atom #{}))

(defn latest-successful-run
  "Return the newest completely materialized candidate snapshot."
  []
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status :succeeded
                 {:order-by [[:finished_at :desc] [:id :desc]]}))

(defn active-run
  "Return the newest queued or running candidate refresh."
  []
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status [:in [:queued :running]]
                 {:order-by [[:id :desc]]}))

(defn- latest-failed-run
  []
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status :failed
                 {:order-by [[:finished_at :desc] [:id :desc]]}))

(defn refresh-status
  "Return the successful, active, and failed refresh state used by the API."
  []
  {:snapshot (latest-successful-run)
   :active   (active-run)
   :failure  (latest-failed-run)})

(defn- create-run!
  [trigger requested-by]
  (t2/insert-returning-instance! :model/UsageMetadataCandidateRun
                                 {:status            :queued
                                  :trigger           trigger
                                  :requested_by      requested-by
                                  :algorithm_version algorithm-version
                                  :source_config     snapshot/source-config}))

(defn fail-run!
  "Mark a queued or running refresh as failed."
  [run error]
  (t2/update! :model/UsageMetadataCandidateRun (:id run)
              {:status :failed, :finished_at (mi/now), :error (ex-message error)})
  nil)

(defn candidate-refresh-lock-timeout?
  "Whether an exception reports a timeout for the candidate execution lock."
  [error]
  (let [lock-name (str (namespace ::candidate-refresh) "/" (name ::candidate-refresh))]
    (boolean (some #{lock-name} (:lock-names (ex-data error))))))

(defn- queued-run-stale?
  [{:keys [status created_at]}]
  (and (= status :queued)
       (some-> created_at
               (t/before? (t/minus (t/offset-date-time) queued-run-startup-grace)))))

(defn- recover-interrupted-run!
  [{run-id :id, status :status :as run}]
  (cond
    (queued-run-stale? run)
    (do
      (fail-run! run (ex-info "Usage metadata candidate refresh was interrupted before processing started"
                              {:run-id run-id}))
      nil)

    (and (= status :running)
         (not (contains? @locally-running-run-ids run-id)))
    (try
      (cluster-lock/with-cluster-lock {:lock ::candidate-refresh
                                       :timeout-seconds 1
                                       :retry-config {:max-retries 0}}
        (when (= :running (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id run-id))
          (fail-run! run (ex-info "Usage metadata candidate refresh was interrupted by a server shutdown or restart"
                                  {:run-id run-id})))
        nil)
      (catch Exception e
        (if (candidate-refresh-lock-timeout? e)
          run
          (throw e))))

    :else
    run))

(defn queue-refresh!
  "Atomically queue a refresh unless one is already queued or running."
  [trigger requested-by]
  (cluster-lock/with-cluster-lock {:lock ::candidate-refresh-enqueue, :timeout-seconds 1}
    (when-not (some-> (active-run) recover-interrupted-run!)
      (create-run! trigger requested-by))))

(defn run-refresh!
  "Run a candidate refresh under the instance-wide materialization lock."
  [{run-id :id :as run}]
  (swap! locally-running-run-ids conj run-id)
  (try
    (cluster-lock/with-cluster-lock {:lock ::candidate-refresh, :timeout-seconds 1}
      (try
        (snapshot/materialize! run)
        (catch InterruptedException e
          (.interrupt (Thread/currentThread))
          (fail-run! run e)
          (throw e))
        (catch Exception e
          (log/error e "Usage metadata candidate refresh failed")
          (fail-run! run e)
          (throw e))))
    (catch Exception e
      (when (= :queued (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id run-id))
        (fail-run! run e))
      (throw e))
    (finally
      (swap! locally-running-run-ids disj run-id))))
