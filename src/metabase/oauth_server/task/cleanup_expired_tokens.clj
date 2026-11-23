(ns metabase.oauth-server.task.cleanup-expired-tokens
  "Daily Quartz job that deletes expired and revoked OAuth rows."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.oauth-server.models.oauth-access-token :as oauth-access-token]
   [metabase.oauth-server.models.oauth-authorization-code :as oauth-authorization-code]
   [metabase.oauth-server.models.oauth-refresh-token :as oauth-refresh-token]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- delete-ids!
  "Delete the rows with `ids` with the write function `delete!` and return how many there were."
  [delete! ids]
  (delete! ids)
  (count ids))

(defn cleanup-expired-tokens!
  "Delete expired authorization codes/access tokens/refresh tokens, and any access/refresh rows
   that have been explicitly revoked. Returns a map of counts of rows deleted."
  []
  ;; Issue expiry- and revocation-based deletes as separate statements so each can use the appropriate
  ;; index (expiry / revoked_at). A combined `OR` predicate would prevent the planner from using either
  ;; index and degrade into a table scan as these tables grow.
  (let [now             (System/currentTimeMillis)
        codes-expired   (delete-ids! oauth-authorization-code/delete-oauth-authorization-codes!
                                     (oauth-server.db/authorization-code-ids-expired-before now))
        access-expired  (delete-ids! oauth-access-token/delete-oauth-access-tokens!
                                     (oauth-server.db/access-token-ids-expired-before now))
        access-revoked  (delete-ids! oauth-access-token/delete-oauth-access-tokens!
                                     (oauth-server.db/revoked-access-token-ids))
        refresh-expired (delete-ids! oauth-refresh-token/delete-oauth-refresh-tokens!
                                     (oauth-server.db/refresh-token-ids-expired-before now))
        refresh-revoked (delete-ids! oauth-refresh-token/delete-oauth-refresh-tokens!
                                     (oauth-server.db/revoked-refresh-token-ids))]
    {:authorization-codes-expired codes-expired
     :access-tokens-expired       access-expired
     :access-tokens-revoked       access-revoked
     :refresh-tokens-expired      refresh-expired
     :refresh-tokens-revoked      refresh-revoked}))

(task/defjob CleanupExpiredOAuthTokens
  "Delete expired and revoked OAuth tokens and authorization codes."
  {:saved-class "metabase.oauth_server.task.cleanup_expired_tokens.CleanupExpiredOAuthTokens"}
  [_]
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
