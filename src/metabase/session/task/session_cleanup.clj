(ns metabase.session.task.session-cleanup
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.task.core :as task]
   [metabase.tracing.attributes :as trace-attrs]
   [metabase.tracing.core :as tracing]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- cleanup-sessions!
  "Deletes sessions from the database which are no longer valid"
  []
  (let [oldest-allowed [:inline (h2x/add-interval-honeysql-form (mdb/db-type)
                                                                :%now
                                                                (- (config/config-int :max-session-age))
                                                                :minute)]
        hsql           {:delete-from [(t2/table-name :model/Session)]
                        :where       [:< :created_at oldest-allowed]}]
    (tracing/with-span :tasks "task.session-cleanup.delete" {:db/statement (trace-attrs/sanitize-sql hsql)}
      (t2/query-one hsql))))

(def ^:private session-cleanup-job-key (jobs/key "metabase.task.session-cleanup.job"))
(def ^:private session-cleanup-trigger-key (triggers/key "metabase.task.session-cleanup.trigger"))

(task/defjob ^{:doc "Job that cleans up outdated sessions."}
  SessionCleanup
  [_]
  (cleanup-sessions!))

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
