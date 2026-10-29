(ns metabase-enterprise.impersonation.task.query-cache-cleanup
  "Scheduled task that deletes impersonation query cache rows cached by another Metabase version or more than
  [[max-age-days]] ago."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.impersonation.db :as impersonation.db]
   [metabase.config.core :as config]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private max-age-days
  "How long a cached validation result is kept."
  30)

(def ^:private cleanup-job-key (jobs/key "metabase.task.impersonation.query-cache-cleanup.job"))
(def ^:private cleanup-trigger-key (triggers/key "metabase.task.impersonation.query-cache-cleanup.trigger"))

(mu/defn- cleanup-query-cache! :- :nil
  "Delete the outdated impersonation query cache rows."
  []
  (let [cutoff  (t/minus (t/offset-date-time) (t/days max-age-days))
        deleted (impersonation.db/delete-outdated-query-cache-rows! config/mb-version-string cutoff)]
    (log/infof "Impersonation query cache cleanup complete. Deleted %d row(s)." deleted)))

(task/defjob ImpersonationQueryCacheCleanup
  "Delete outdated impersonation query cache rows"
  {:saved-class "metabase_enterprise.impersonation.task.query_cache_cleanup.ImpersonationQueryCacheCleanup"
   :concurrent? false}
  [_ctx]
  (cleanup-query-cache!))

(defmethod task/init! ::ImpersonationQueryCacheCleanup
  [_]
  (let [job     (jobs/build
                 (jobs/of-type ImpersonationQueryCacheCleanup)
                 (jobs/with-identity cleanup-job-key))
        trigger (triggers/build
                 (triggers/with-identity cleanup-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  (cron/cron-schedule "37 41 23 * * ?")))]
    (task/schedule-task! job trigger)))
