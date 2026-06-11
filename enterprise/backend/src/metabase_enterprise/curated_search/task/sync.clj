(ns metabase-enterprise.curated-search.task.sync
  "Quartz job running the curated search mirror reconciliation.

  Scheduled periodically as a safety net; appdb writes also trigger it immediately via
  [[metabase-enterprise.curated-search.core/request-sync!]], so curator edits become searchable
  within seconds.
  `DisallowConcurrentExecution` plus Quartz's trigger coalescing debounce edit bursts to at most one
  queued extra run, and Quartz clustering ensures a single node runs it."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.curated-search.core :as curated-search.core]
   [metabase-enterprise.curated-search.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.time Duration Instant)
   (java.util Date)))

(set! *warn-on-reflection* true)

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Reconciles the curated search pgvector mirror with the appdb table."}
  CuratedSearchEntrySync [_ctx]
  (when (curated-search.core/available?)
    (try
      (let [result (reconcile/reconcile! (semantic.db.datasource/ensure-initialized-data-source!)
                                         (embedding/get-configured-model))]
        (when (pos? (+ (:upserted result) (:deleted result)))
          (log/info "curated search mirror reconciled" result)))
      (catch Throwable e
        ;; Log and move on: the next periodic run retries from the authoritative appdb table.
        (log/error e "curated search mirror reconciliation failed")))))

(def ^:private ^Duration startup-delay (Duration/parse "PT10S"))
(def ^:private ^Duration run-frequency (Duration/parse "PT30S"))

(defmethod task/init! ::CuratedSearchEntrySync [_]
  ;; Gate scheduling on pgvector being configured (boot-fixed), NOT on available? — the job body
  ;; self-gates on the feature flag, so scheduling here lets the periodic safety net (and the
  ;; write-path trigger's target job) exist even when the license is enabled after startup.
  (when (curated-search.core/pgvector-configured?)
    (let [job     (jobs/build
                   (jobs/of-type CuratedSearchEntrySync)
                   (jobs/store-durably)
                   (jobs/with-identity curated-search.core/sync-job-key))
          trigger (triggers/build
                   (triggers/with-identity
                    (triggers/key "metabase-enterprise.curated-search.sync.trigger"))
                   (triggers/for-job curated-search.core/sync-job-key)
                   (triggers/start-at (Date/from (.plus (Instant/now) startup-delay)))
                   (triggers/with-schedule
                    (simple/schedule
                     (simple/with-interval-in-milliseconds (.toMillis run-frequency))
                     (simple/repeat-forever))))]
      (task/schedule-task! job trigger))))
