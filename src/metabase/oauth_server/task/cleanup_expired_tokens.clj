(ns metabase.oauth-server.task.cleanup-expired-tokens
  "Daily Quartz job that deletes expired and revoked OAuth rows."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- delete-where! [model where]
  (t2/query-one {:delete-from [(t2/table-name model)]
                 :where       where}))

(defn cleanup-expired-tokens!
  "Delete expired authorization codes/access tokens/refresh tokens, and any access/refresh rows
   that have been explicitly revoked."
  []
  (let [now (System/currentTimeMillis)]
    (delete-where! :model/OAuthAuthorizationCode [:< :expiry now])
    (delete-where! :model/OAuthAccessToken      [:or [:< :expiry now] [:not= :revoked_at nil]])
    (delete-where! :model/OAuthRefreshToken     [:or
                                                 [:and [:not= :expiry nil] [:< :expiry now]]
                                                 [:not= :revoked_at nil]])))

(task/defjob ^{:doc "Delete expired and revoked OAuth tokens and authorization codes."}
  CleanupExpiredOAuthTokens [_]
  (log/debug "Cleaning up expired/revoked OAuth tokens")
  (tracing/with-span :tasks "task.oauth-cleanup-expired-tokens.delete" {}
    (cleanup-expired-tokens!)))

(def ^:private job-key     (jobs/key "metabase.task.oauth-cleanup-expired-tokens.job"))
(def ^:private trigger-key (triggers/key "metabase.task.oauth-cleanup-expired-tokens.trigger"))

(defmethod task/init! ::CleanupExpiredOAuthTokens [_]
  (let [job     (jobs/build
                 (jobs/of-type CleanupExpiredOAuthTokens)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; daily at midnight
                  (cron/cron-schedule "0 0 0 * * ? *")))]
    (task/schedule-task! job trigger)))
