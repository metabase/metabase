(ns metabase-enterprise.workspaces.task.remapping-poll
  "Quartz wiring for [[metabase-enterprise.workspaces.remapping-poll/poll-once!]].

   Schedules a recurring 30s job that keeps the app-db `table_remapping` cache in sync
   with the per-workspace `_mb_remappings` ledgers on the warehouses. The trigger is
   always registered — the job body re-checks `(ws/active?)` on every tick so
   non-workspaced instances do no real work. The trigger MUST be registered
   unconditionally because `task/init-scheduler!` runs before
   `config-from-file/init-from-file-if-code-available!` in `metabase.core.core/init!*`,
   meaning a config.yml-driven workspace instance sees `(ws/active?)` return false at
   init time. Gating the registration on `(ws/active?)` would leave such instances
   without a recurring tick.

   Startup bootstrap (the *eager* first tick that runs synchronously before the
   scheduler even starts) lives in
   `metabase-enterprise.advanced-config.file.workspace/initialize-section!` so that
   remappings are present for queries that hit the QP in the first 30 seconds after
   boot. See that ns's docstring."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping-poll :as remapping-poll]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.time Duration)))

(set! *warn-on-reflection* true)

(def ^:private ^Duration poll-interval (Duration/ofSeconds 30))

(def ^:private job-key     (jobs/key "metabase.enterprise.workspaces.remapping-poll.job"))
(def ^:private trigger-key (triggers/key "metabase.enterprise.workspaces.remapping-poll.trigger"))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Sync workspace remapping ledgers into the app-db cache."}
  RemappingPoll [_ctx]
  (when (ws/active?)
    (try
      (remapping-poll/poll-once!)
      (catch Throwable t
        (log/warn t "remapping-poll: unhandled error in scheduled tick")))))

(defmethod task/init! ::RemappingPoll [_]
  (let [job     (jobs/build
                 (jobs/of-type RemappingPoll)
                 (jobs/store-durably)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  (simple/schedule
                   (simple/with-interval-in-milliseconds (.toMillis poll-interval))
                   (simple/repeat-forever))))]
    (log/info "Scheduling workspace remapping poller")
    (task/schedule-task! job trigger)))
