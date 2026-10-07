(ns metabase-enterprise.support-access-grants.task.expire-grants
  "Periodically tear down support-access-grant access once the grant window has closed.

  Revoking a grant cleans up immediately, but a grant that just runs out has no such trigger. Session validation and
  session cleanup already refuse and reap sessions past their `expires_at`, so this sweep is defense-in-depth: it
  drops the support user's leftover superuser bit, sessions, and usable credentials promptly instead of leaving them
  around until someone revokes."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.support-access-grants.core :as grants]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc                                   "Revoke support access once its grant has ended"}
  ExpireSupportAccessGrants [_ctx]
  (grants/expire-ended-grants!))

(def ^:private job
  (jobs/build
   (jobs/with-description "Revoke support access once its grant has ended")
   (jobs/of-type ExpireSupportAccessGrants)
   (jobs/with-identity (jobs/key "metabase-enterprise.support-access-grants.expire-grants.job"))
   (jobs/store-durably)))

(def ^:private trigger
  (triggers/build
   (triggers/with-identity (triggers/key "metabase-enterprise.support-access-grants.expire-grants.trigger"))
   (triggers/start-now)
   (triggers/with-schedule
    ;; every five minutes — a grant is granted in minutes, so the sweep should not lag it by much
    (cron/cron-schedule "0 0/5 * * * ? *"))))

(defmethod task/init! ::ExpireSupportAccessGrants [_]
  (task/schedule-task! job trigger))
