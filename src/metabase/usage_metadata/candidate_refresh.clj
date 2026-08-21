(ns metabase.usage-metadata.candidate-refresh
  "Lifecycle and cluster coordination for persisted candidate refreshes."
  (:require
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.models.interface :as mi]
   [metabase.mq.core :as mq]
   [metabase.usage-metadata.candidate-snapshot :as snapshot]
   [metabase.usage-metadata.models.candidate]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:const algorithm-version
  "Version of persisted candidate materialization behavior."
  1)

(defonce ^{:doc "Run ids currently executing in this process."}
  locally-running-run-ids (atom #{}))

(defn latest-successful-run
  "Return the newest completely materialized candidate snapshot."
  []
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status :succeeded
                 {:order-by [[:finished_at :desc] [:id :desc]]}))

(defn candidate-current?
  "Whether `candidate` belongs to the latest successful snapshot."
  [candidate]
  (= (:run_id candidate) (:id (latest-successful-run))))

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
  (t2/update! :model/UsageMetadataCandidateRun
              {:id (:id run), :status [:in [:queued :running]]}
              {:status :failed, :finished_at (mi/now), :error (ex-message error)})
  nil)

(defn- claim-run!
  [{run-id :id :as run}]
  (let [started-at (mi/now)]
    (when (pos? (t2/update! :model/UsageMetadataCandidateRun
                            {:id run-id, :status :queued}
                            {:status :running, :started_at started-at, :error nil}))
      (assoc run :status :running, :started_at started-at, :error nil))))

(defn candidate-refresh-lock-timeout?
  "Whether an exception reports a timeout for the candidate execution lock."
  [error]
  (let [lock-name (str (namespace ::candidate-refresh) "/" (name ::candidate-refresh))]
    (boolean (some #{lock-name} (:lock-names (ex-data error))))))

(defn- interrupted-run-error
  [run-id]
  (ex-info "Usage metadata candidate refresh was interrupted by a server shutdown or restart"
           {:run-id run-id}))

(defn- recover-interrupted-run!
  [{run-id :id, status :status :as run}]
  (if (and (= status :running)
           (not (contains? @locally-running-run-ids run-id)))
    (try
      (cluster-lock/with-cluster-lock {:lock ::candidate-refresh
                                       :timeout-seconds 1
                                       :retry-config {:max-retries 0}}
        (when (= :running (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id run-id))
          (fail-run! run (interrupted-run-error run-id)))
        nil)
      (catch Exception e
        (if (candidate-refresh-lock-timeout? e)
          run
          (throw e))))
    run))

(defn- publish-refresh!
  [{run-id :id}]
  (mq/with-queue :queue/usage-metadata-candidate-refresh [queue]
    (mq/put queue {:run-id run-id})))

(defn queue-refresh!
  "Atomically create and dispatch a refresh unless one is already running.

  An existing queued run is dispatched again rather than failed based on its age. Delivery is
  at-least-once; [[run-refresh!]] conditionally claims the run before doing any work."
  [trigger requested-by]
  (cluster-lock/with-cluster-lock {:lock ::candidate-refresh-enqueue, :timeout-seconds 1}
    ;; H2's cluster lock is in-process and does not provide a transaction. Keep run creation and
    ;; the transactional-outbox message atomic on every application database.
    (t2/with-transaction [_conn]
      (if-let [run (some-> (active-run) recover-interrupted-run!)]
        (when (= :queued (:status run))
          (publish-refresh! run)
          run)
        (let [run (create-run! trigger requested-by)]
          (publish-refresh! run)
          run)))))

(defn run-refresh!
  "Conditionally claim and run a candidate refresh under the instance-wide materialization lock."
  [{run-id :id :as run}]
  (let [claimed? (volatile! false)]
    (swap! locally-running-run-ids conj run-id)
    (try
      (cluster-lock/with-detached-cluster-lock {:lock ::candidate-refresh, :timeout-seconds 1}
        (if-let [claimed-run (claim-run! run)]
          (do
            (vreset! claimed? true)
            (snapshot/materialize! claimed-run))
          (when-let [current-run (t2/select-one :model/UsageMetadataCandidateRun :id run-id)]
            (if (= :running (:status current-run))
              ;; The durable message was recovered after its original worker disappeared. Holding
              ;; the execution lock proves no live worker still owns the run. Partial candidate rows
              ;; are isolated by run id, so fail this attempt and dispatch a clean replacement.
              (do
                (fail-run! current-run (interrupted-run-error run-id))
                (queue-refresh! (:trigger current-run) (:requested_by current-run)))
              current-run))))
      (catch Throwable failure
        (let [interrupted? (instance? InterruptedException failure)]
          (when-not interrupted?
            (log/error failure "Usage metadata candidate refresh failed"))
          (when @claimed?
            (try
              (fail-run! run failure)
              (catch Throwable marking-failure
                ;; Preserve the materialization failure as the one callers observe even if recording it also fails.
                (.addSuppressed ^Throwable failure marking-failure)
                (log/error marking-failure "Failed to record usage metadata candidate refresh failure"))))
          (when interrupted?
            (.interrupt (Thread/currentThread)))
          (throw failure)))
      (finally
        (swap! locally-running-run-ids disj run-id)))))

(defn- fail-undeliverable-refreshes!
  [{:keys [messages error]}]
  (doseq [{:keys [run-id]} messages]
    ;; A separately delivered copy may already have claimed or completed this run. The queue's
    ;; terminal failure is authoritative only while no worker has claimed it.
    (t2/update! :model/UsageMetadataCandidateRun
                {:id run-id, :status :queued}
                {:status      :failed
                 :finished_at (mi/now)
                 :error       (str "Usage metadata candidate refresh could not be dispatched: "
                                   (ex-message error))})))

(mq/def-queue! :queue/usage-metadata-candidate-refresh
  {:transactional      :require
   :exclusive          true
   :max-batch-messages 1
   :dedup-fn           distinct
   :on-error           fail-undeliverable-refreshes!})

(mq/def-listener! :queue/usage-metadata-candidate-refresh [messages]
  (doseq [{:keys [run-id]} messages]
    (when-let [run (t2/select-one :model/UsageMetadataCandidateRun :id run-id)]
      (run-refresh! run))))
