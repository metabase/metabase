(ns metabase.session.task.session-cleanup
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.config.core :as config]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.session.db :as session.db]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(defn- record-unrecorded-endings!
  "Record the ending of every session that is no longer live but still has no `ended_at`: `expired` for a row past
  its own `expires_at` or `max-session-age`, `timed-out` for one idle past the session timeout, `user-deactivated`
  or `tenant-deactivated` for a deactivated user or tenant. Clears each key. Once recorded, an ending is final:
  raising the idle timeout afterwards revives nothing."
  []
  (let [unrecorded (session.db/sessions-with-unrecorded-ending (session/liveness-params))]
    (doseq [[reason rows] (group-by :reason unrecorded)]
      (session.db/end-sessions-by-ids! (mapv :id rows) reason nil))))

(defn- cleanup-sessions!
  "Two passes over `core_session`: record the ending of every session that has stopped being live, then delete the
  rows whose recorded ending is older than the retention period. MCP-backed rows are not sessions and are simply
  deleted once they expire, as they always were."
  []
  (session.db/delete-expired-mcp-sessions! (config/config-int :max-session-age)
                                           (request/enabled-session-timeout-seconds))
  (record-unrecorded-endings!)
  (session.db/delete-sessions-ended-long-ago!))

(def ^:private session-cleanup-job-key (jobs/key "metabase.task.session-cleanup.job"))
(def ^:private session-cleanup-trigger-key (triggers/key "metabase.task.session-cleanup.trigger"))

(task/defjob ^{:doc "Job that records the ending of sessions that stopped being live, and deletes those ended long ago."}
  SessionCleanup
  [_]
  (cleanup-sessions!)
  (session/prune-session-activity-cache!))

(defmethod task/init! ::SessionCleanup [_]
  (let [job (jobs/build
             (jobs/of-type SessionCleanup)
             (jobs/with-identity session-cleanup-job-key))
        trigger (triggers/build
                 (triggers/with-identity session-cleanup-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; run once a day
                  (cron/cron-schedule "0 0 2 * * ? *")))]
    (task/schedule-task! job trigger)))
