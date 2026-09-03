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

(defn- cleanup-sessions!
  "Deletes sessions from the database which are no longer valid. Removes sessions that exceed MAX_SESSION_AGE
   (absolute lifetime), sessions past their own `expires_at`, and sessions that have been idle longer than the
   session-timeout setting (if configured)."
  []
  (session.db/delete-expired-sessions! (config/config-int :max-session-age)
                                       (request/enabled-session-timeout-seconds)))

(def ^:private session-cleanup-job-key (jobs/key "metabase.task.session-cleanup.job"))
(def ^:private session-cleanup-trigger-key (triggers/key "metabase.task.session-cleanup.trigger"))

(task/defjob ^{:doc "Job that cleans up outdated sessions."}
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
