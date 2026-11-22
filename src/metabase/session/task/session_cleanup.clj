(ns metabase.session.task.session-cleanup
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.session.db :as session.db]
   [metabase.session.models.session :as models.session]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(def ^:private ended-session-retention-days
  "How long an ended session stays on record before the cleanup deletes its row, a constant rather than a setting, and
  not `audit-max-retention-days`, which defaults to two years for the audit tables."
  30)

(defn- record-unrecorded-endings!
  "Record the ending of every session that is no longer live but still has no `ended_at`: `expired` for a row past
  its own `expires_at` or `max-session-age`, `timed-out` for one idle past the session timeout, `user-deactivated`
  or `tenant-deactivated` for a deactivated user or tenant. Clears each key. Once recorded, an ending is final:
  raising the idle timeout afterwards revives nothing."
  []
  (let [unrecorded (session.db/sessions-with-unrecorded-ending (session/liveness-params))]
    (doseq [[reason rows] (group-by :reason unrecorded)]
      (models.session/end-sessions! (mapv :id rows) reason nil))))

(defn- cleanup-sessions!
  "Two passes over `core_session`: record the ending of every session that has stopped being live, then delete the
  rows whose recorded ending is older than the retention period. MCP-backed rows are not sessions and are simply
  deleted once they expire, as they always were."
  []
  (models.session/delete-sessions-for-mcp-cleanup! (config/config-int :max-session-age)
                                                   (request/enabled-session-timeout-seconds))
  (record-unrecorded-endings!)
  (models.session/delete-sessions-for-cleanup! (t/minus (t/offset-date-time) (t/days ended-session-retention-days))))

(def ^:private session-cleanup-job-key (jobs/key "metabase.task.session-cleanup.job"))
(def ^:private session-cleanup-trigger-key (triggers/key "metabase.task.session-cleanup.trigger"))

(task/defjob SessionCleanup
  "Job that records the ending of sessions that stopped being live, and deletes those ended long ago."
  {:saved-class "metabase.session.task.session_cleanup.SessionCleanup"}
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
