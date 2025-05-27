(ns metabase.session.task.session-cleanup
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.task.core :as task]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- cleanup-sessions!
  "Deletes sessions from the database which are no longer valid"
  []
  (let [oldest-allowed [:inline (sql.qp/add-interval-honeysql-form (mdb/db-type)
                                                                   :%now
                                                                   (- (config/config-int :max-session-age))
                                                                   :minute)]]
    (t2/delete! :model/Session :created_at [:< oldest-allowed])))

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
