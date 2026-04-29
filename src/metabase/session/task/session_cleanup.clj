(ns metabase.session.task.session-cleanup
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- cleanup-sessions!
  "Deletes sessions from the database which are no longer valid. Removes sessions that exceed MAX_SESSION_AGE
   (absolute lifetime) and also sessions that have been idle longer than the session-timeout setting (if configured)."
  []
  (let [oldest-allowed [:inline (h2x/add-interval-honeysql-form (mdb/db-type)
                                                                :%now
                                                                (- (config/config-int :max-session-age))
                                                                :minute)]
        timeout-seconds (request/enabled-session-timeout-seconds)
        timeout-oldest  (when timeout-seconds
                          [:inline (h2x/add-interval-honeysql-form (mdb/db-type)
                                                                   :%now
                                                                   (- timeout-seconds)
                                                                   :second)])
        where-clause    (if timeout-oldest
                          [:or
                           [:< :created_at oldest-allowed]
                           [:< [:coalesce :last_active_at :created_at] timeout-oldest]]
                          [:< :created_at oldest-allowed])
        hsql            {:delete-from [(t2/table-name :model/Session)]
                         :where       where-clause}]
    (tracing/with-span :tasks "task.session-cleanup.delete" {:db/statement (tracing/best-effort-sanitize-sql hsql)}
      (t2/query-one hsql))))

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
