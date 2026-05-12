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

(defn cleanup-expired-tokens!
  "Delete expired authorization codes/access tokens/refresh tokens, and any access/refresh rows
   that have been explicitly revoked. Returns a map of counts of rows deleted."
  []
  (let [now (System/currentTimeMillis)]
    ;; Issue expiry- and revocation-based deletes as separate statements so each can use the appropriate
    ;; index (expiry / revoked_at). A combined `OR` predicate would prevent the planner from using either
    ;; index and degrade into a table scan as these tables grow.
    {:authorization-codes-expired (t2/delete! :model/OAuthAuthorizationCode :expiry [:< now])
     :access-tokens-expired       (t2/delete! :model/OAuthAccessToken       :expiry [:< now])
     :access-tokens-revoked       (t2/delete! :model/OAuthAccessToken       :revoked_at [:not= nil])
     :refresh-tokens-expired      (t2/delete! :model/OAuthRefreshToken      :expiry [:< now])
     :refresh-tokens-revoked      (t2/delete! :model/OAuthRefreshToken      :revoked_at [:not= nil])}))

(task/defjob ^{:doc "Delete expired and revoked OAuth tokens and authorization codes."}
  CleanupExpiredOAuthTokens [_]
  (log/debug "Cleaning up expired/revoked OAuth tokens")
  (tracing/with-span :tasks "task.oauth-server.cleanup-expired-tokens.delete" {}
    (let [counts (cleanup-expired-tokens!)]
      (log/infof "OAuth cleanup deleted %s" counts))))

(def ^:private job-key     (jobs/key "metabase.task.oauth-server.cleanup-expired-tokens.job"))
(def ^:private trigger-key (triggers/key "metabase.task.oauth-server.cleanup-expired-tokens.trigger"))

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
