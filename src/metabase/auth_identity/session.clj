(ns metabase.auth-identity.session
  "Integration between AuthIdentity and Session systems. Provides wrappers around
  session creation that track authentication provider usage."
  (:require
   [metabase.login-history.core :as login-history]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn create-session-with-auth-tracking!
  "Create a new Session for a User and update the last_used_at timestamp on the corresponding AuthIdentity."
  [user device-info provider]
  (let [user-id (u/the-id user)
        provider-str (name provider)
        auth-identity-id (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider provider-str)
        session-key (str (random-uuid))
        session-id (string/random-string 12)
        session (t2/insert-returning-instance! :model/Session
                                               ;; Without setting the ID here we can't return an instance
                                               ;; on MySQL
                                               :id session-id
                                               :user_id user-id
                                               :auth_identity_id auth-identity-id
                                               :session_key session-key)]
    (when provider-str
      (log/debugf "Updating last_used_at for user %s with provider %s" user-id provider-str)
      (t2/update! :model/AuthIdentity auth-identity-id {:last_used_at :%now}))
    (when device-info
      (login-history/record-login-history! session-id user device-info))
    (assoc session
           :key session-key
           :type (if (some-> (request/current-request) request/embedded?) :full-app-embed :normal))))
