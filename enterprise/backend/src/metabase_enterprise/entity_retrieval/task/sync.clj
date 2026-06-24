(ns metabase-enterprise.entity-retrieval.task.sync
  "Quartz job running the library entity index reconciliation.

  Scheduled periodically as a safety net; appdb writes also trigger it immediately via
  [[metabase-enterprise.entity-retrieval.core/request-sync!]], so curator edits become searchable
  within seconds.
  `DisallowConcurrentExecution` plus Quartz's trigger coalescing debounce edit bursts to at most one
  queued extra run, and Quartz clustering ensures a single node runs it."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval.core]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.time Duration Instant)
   (java.util Date)))

(set! *warn-on-reflection* true)

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Reconciles the library entity index (pgvector) with the appdb."}
  OsiAiContextSync [_ctx]
  (when (entity-retrieval.core/available?)
    (try
      (let [{:keys [inserted deleted] :as result}
            (reconcile/reconcile! (semantic.db.datasource/ensure-initialized-data-source!)
                                  (embedding/get-configured-model))]
        (when (pos? (+ (or inserted 0) (or deleted 0)))
          (log/info "library entity index reconciled" result)))
      (catch Throwable e
        ;; Log and move on: the next periodic run retries from the authoritative appdb table.
        (log/error e "entity-retrieval mirror reconciliation failed")))))

(def ^:private ^Duration startup-delay (Duration/parse "PT10S"))
(def ^:private ^Duration run-frequency (Duration/parse "PT30S"))

(defmethod task/init! ::OsiAiContextSync [_]
  ;; Gate scheduling on pgvector being configured (boot-fixed), NOT on available? — the job body
  ;; self-gates on the feature flag, so scheduling here lets the periodic safety net (and the
  ;; write-path trigger's target job) exist even when the license is enabled after startup.
  (when (entity-retrieval.core/pgvector-configured?)
    (let [job     (jobs/build
                   (jobs/of-type OsiAiContextSync)
                   (jobs/store-durably)
                   (jobs/with-identity entity-retrieval.core/sync-job-key))
          trigger (triggers/build
                   (triggers/with-identity
                    (triggers/key "metabase-enterprise.entity-retrieval.sync.trigger"))
                   (triggers/for-job entity-retrieval.core/sync-job-key)
                   (triggers/start-at (Date/from (.plus (Instant/now) startup-delay)))
                   (triggers/with-schedule
                    (simple/schedule
                     (simple/with-interval-in-milliseconds (.toMillis run-frequency))
                     (simple/repeat-forever))))]
      (task/schedule-task! job trigger))))
