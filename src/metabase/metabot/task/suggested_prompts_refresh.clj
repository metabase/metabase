(ns metabase.metabot.task.suggested-prompts-refresh
  "Background regeneration of a Metabot's suggested prompts when its content scope changes — e.g. the
  \"verified or curated content\" setting or the configured collection is toggled.
  Scheduling through Quartz keeps the toggle request instant and makes rapid or multi-instance toggles
  converge: a single durable job with `DisallowConcurrentExecution` runs at most one refresh per
  Metabot at a time, a per-Metabot one-shot trigger debounces a burst into one run, and the job
  re-reads the Metabot's current scope so the final run always reflects the committed state."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.metabot.suggested-prompts :as metabot.suggested-prompts]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.request.core :as request]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution ObjectAlreadyExistsException)))

(set! *warn-on-reflection* true)

(def ^:private job-key (jobs/key "metabase.task.metabot.suggested-prompts-refresh.job"))

(defn- trigger-key [metabot-id]
  (triggers/key (str "metabase.task.metabot.suggested-prompts-refresh.trigger." metabot-id)))

;; Delay the run so a burst of toggles debounces into one, and so the setting write settles first.
(def ^:private debounce-seconds 5)

(defn- regenerate!
  "Rebuild `metabot-id`'s suggested prompts from its current scope, atomically.
  Skips when the managed-AI limit is reached. Runs delete+generate in one transaction and rolls it back
  unless new prompts were actually generated — so a Metabot's existing prompts are never wiped to empty
  (e.g. when the curated filter currently excludes its only content). Being a background job, it logs
  and swallows everything."
  [metabot-id]
  ;; System task: run as admin so all in-scope content is considered (per-user reads stay filtered).
  (request/as-admin
    (try
      (when-not (metabot.usage/managed-free-limit-reached?)
        (t2/with-transaction [_conn]
          (metabot.suggested-prompts/delete-all-metabot-prompts metabot-id)
          (let [{:keys [status]} (metabot.suggested-prompts/generate-sample-prompts metabot-id)]
            (when (not= status :generated)
              ;; Better to keep stale prompts than to leave the Metabot with none.
              (throw (ex-info "no new prompts generated" {::preserve true :status status}))))))
      (catch clojure.lang.ExceptionInfo e
        (if (::preserve (ex-data e))
          (log/infof "Kept existing suggested prompts for Metabot %s (regeneration produced %s)"
                     metabot-id (:status (ex-data e)))
          (log/warnf e "Failed to regenerate suggested prompts for Metabot %s" metabot-id)))
      (catch Throwable e
        (log/warnf e "Failed to regenerate suggested prompts for Metabot %s" metabot-id)))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Regenerate a Metabot's suggested prompts after its content scope changes."}
  SuggestedPromptsRefresh [ctx]
  (when-let [metabot-id (get (qc/from-job-data ctx) "metabot-id")]
    (regenerate! metabot-id)))

(def ^:private refresh-job
  (jobs/build
   (jobs/with-description "Regenerate Metabot suggested prompts after a scope change")
   (jobs/of-type SuggestedPromptsRefresh)
   (jobs/with-identity job-key)
   (jobs/store-durably)))

(defn- refresh-trigger [metabot-id]
  (triggers/build
   (triggers/with-identity (trigger-key metabot-id))
   (triggers/for-job job-key)
   (triggers/using-job-data {"metabot-id" metabot-id})
   (triggers/start-at (Date/from (.plusSeconds (Instant/now) debounce-seconds)))
   (triggers/with-schedule
    ;; Fire once; if the run is missed (no node free in time), fire as soon as possible — never drop it.
    (simple/schedule (simple/with-misfire-handling-instruction-fire-now)))))

(defn schedule-refresh!
  "(Re)schedule a background regeneration of `metabot-id`'s suggested prompts.
  Replacing any pending trigger debounces rapid toggles; clustered Quartz plus
  `DisallowConcurrentExecution` serialize execution across instances."
  [metabot-id]
  (let [trigger (refresh-trigger metabot-id)]
    ;; reschedule replaces a pending trigger (debounce); nil means none exists, so add one
    (or (task/reschedule-trigger! trigger)
        (try (task/add-trigger! trigger)
             ;; lost a race with another instance adding the same trigger — fall back to reschedule
             (catch ObjectAlreadyExistsException _
               (task/reschedule-trigger! trigger))))))

(defmethod task/init! ::SuggestedPromptsRefresh
  [_]
  (task/add-job! refresh-job))
