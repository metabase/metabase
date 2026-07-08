(ns metabase-enterprise.entity-retrieval.task.sync
  "Quartz job running a full library entity index reconcile, on a slow schedule, as the backstop.

  Immediate freshness comes from the targeted write path — an `osi_ai_context` edit drives a per-entity
  reconcile (see [[metabase-enterprise.entity-retrieval.core/request-entity-sync!]]) within seconds. This
  periodic full reconcile only catches what isn't hooked: membership / name / description changes to the
  underlying Card/Table/Measure/Segment, and any write whose targeted reconcile was lost (scheduler
  hiccup, pgvector down, an import that bypassed the model hooks). Its first firing, ~10s after boot, is
  also the post-upgrade startup reconcile that rebuilds the index when the doc format changed.
  `DisallowConcurrentExecution` plus Quartz clustering ensure a single node runs it at a time."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval.core]
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
      ;; Full reconcile via the shared coalescing schedule: it waits out a concurrent node rather than
      ;; skipping, and never runs alongside an API- or write-triggered reconcile on this node. Duration
      ;; and mutation metrics are emitted centrally for every run (see entity-retrieval.core).
      (entity-retrieval.core/reconcile-full-coalesced!)
      (catch Throwable e
        ;; Log and move on: the next periodic run retries from the authoritative appdb table.
        (log/error e "entity-retrieval mirror reconciliation failed")))))

(def ^:private ^Duration startup-delay (Duration/parse "PT10S"))
;; Slow: this is the backstop, not the freshness mechanism — the targeted write path keeps the index live.
;; The +10s first firing (startup reconcile / post-upgrade rebuild) is preserved regardless of this value.
(def ^:private ^Duration run-frequency (Duration/parse "PT15M"))

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
