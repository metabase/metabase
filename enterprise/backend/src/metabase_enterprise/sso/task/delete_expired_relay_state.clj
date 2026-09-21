(ns metabase-enterprise.sso.task.delete-expired-relay-state
  "Periodically purge expired `sso_relay_state` rows left behind by SAML embedding logins that were started
  but never completed (popup closed, IdP never posted back, etc.). Consumed entries are deleted on read; this
  sweep only cleans up the abandoned ones."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.sso.models.relay-state :as relay-state]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc                                   "Delete expired SAML SSO RelayState entries"}
  DeleteExpiredSsoRelayState [_ctx]
  (let [deleted (relay-state/delete-expired!)]
    (when (pos? deleted)
      (log/debugf "Deleted %d expired SSO RelayState entries" deleted))))

(def ^:private job
  (jobs/build
   (jobs/with-description "Delete expired SSO RelayState entries")
   (jobs/of-type DeleteExpiredSsoRelayState)
   (jobs/with-identity (jobs/key "metabase-enterprise.sso.delete-expired-relay-state.job"))
   (jobs/store-durably)))

(def ^:private trigger
  (triggers/build
   (triggers/with-identity (triggers/key "metabase-enterprise.sso.delete-expired-relay-state.trigger"))
   (triggers/start-now)
   (triggers/with-schedule
    ;; once an hour, on the hour
    (cron/cron-schedule "0 0 * * * ? *"))))

(defmethod task/init! ::DeleteExpiredSsoRelayState [_]
  (task/schedule-task! job trigger))
