(ns metabase.auth-identity.session
  "Integration between AuthIdentity and Session systems. Provides wrappers around
  session creation that track authentication provider usage."
  (:require
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.auth-identity.models.auth-identity :as auth-identity]
   [metabase.login-history.core :as login-history]
   [metabase.request.core :as request]
   [metabase.session.models.session :as models.session]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn create-session-with-auth-tracking!
  "Create a new Session for a User and update the last_used_at timestamp on the corresponding AuthIdentity.

  The session row and its `login_history` row are written in one transaction: `login_history.session_id` has a foreign
  key to `core_session`, so a concurrent session delete (e.g. a password change, which invalidates the user's sessions)
  must not be able to remove the freshly-created session between the two inserts and break that reference.

  `opts` carries provider-specific extras for the session row: the `:saml-*` keys come from a SAML login assertion and
  are stored so single logout can name the session and subject the IdP knows."
  ([user :- ::users.schema/user
    device-info :- [:maybe request/DeviceInfo]
    provider :- :keyword
    mfa-auth-identity-id :- [:maybe ms/PositiveInt]
    opts :- [:map {:closed true}
             [:saml-session-index  {:optional true} [:maybe :string]]
             [:saml-name-id        {:optional true} [:maybe :string]]
             [:saml-name-id-format {:optional true} [:maybe :string]]]]
   (let [user-id (u/the-id user)
         provider-str (name provider)
         auth-identity (auth-identity.db/auth-identity-expiry user-id provider-str)
         auth-identity-id (:id auth-identity)
         session-key (str (random-uuid))
         session-id (string/random-string 12)
         session (t2/with-transaction [_]
                   (u/prog1 (models.session/create-session!
                             {:id                   session-id
                              :user_id              user-id
                              :auth_identity_id     auth-identity-id
                              :session_key          session-key
                              :expires_at           (:expires_at auth-identity)
                              :mfa_auth_identity_id mfa-auth-identity-id
                              :saml_session_index   (:saml-session-index opts)
                              :saml_name_id         (:saml-name-id opts)
                              :saml_name_id_format  (:saml-name-id-format opts)})
                     (when provider-str
                       (log/debugf "Updating last_used_at for user %s with provider %s" user-id provider-str)
                       (auth-identity/touch-auth-identity! auth-identity-id))
                     (when device-info
                       (login-history/record-login-history! session-id user device-info))))]
     (assoc session
            :key session-key
            :type (if (some-> (request/current-request) request/embedded?) :full-app-embed :normal))))

  ([user :- ::users.schema/user
    device-info :- [:maybe request/DeviceInfo]
    provider :- :keyword
    mfa-auth-identity-id :- [:maybe ms/PositiveInt]]
   (create-session-with-auth-tracking! user device-info provider mfa-auth-identity-id {}))

  ([user :- ::users.schema/user device-info :- [:maybe request/DeviceInfo] provider :- :keyword]
   (create-session-with-auth-tracking! user device-info provider nil {})))
