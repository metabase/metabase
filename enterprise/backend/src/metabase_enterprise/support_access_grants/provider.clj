(ns metabase-enterprise.support-access-grants.provider
  "Auth provider for support access grants with time-limited passwords.

  This provider extends the emailed-secret provider to support time-limited passwords for customer support access.
  When a support access grant is active, password reset tokens created for support access will track the grant's
  end time and automatically set the user's password to expire when the grant expires."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.schema :as schema]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn create-support-access-reset-token-credentials
  "Creates a credentials map for a support access password reset token with grant end time tracking.

  Similar to [[emailed-secret/create-reset-token-credentials]], but adds a `:grant_ends_at` timestamp that
  tracks when the support access grant expires. The token itself expires in 48 hours (or as specified), but
  the grant end time is used to set the password expiration when the user logs in.

  Parameters:
  - `token`: The plaintext reset token that will be hashed using bcrypt
  - `grant-ends-at`: The instant when the support access grant expires
  - `expires-in-ms`: Optional token TTL in milliseconds (defaults to 48 hours)

  Returns a map containing:
  - `:token_hash` - The bcrypt hash of the token
  - `:expires_at` - When the token itself expires
  - `:grant_ends_at` - When the support access grant expires
  - `:consumed_at` - Initially nil, set when token is used"
  [token :- :string
   grant-ends-at :- ::schema/timestamp
   & {:keys [expires-in-ms]
      :or {expires-in-ms (* 48 60 60 1000)}}]
  {:token_hash (u.password/hash-bcrypt token)
   :expires_at (t/plus (t/instant) (t/millis expires-in-ms))
   :grant_ends_at grant-ends-at
   :consumed_at nil})

(mu/defn create-support-access-reset!
  "Creates or updates a support access password reset token for a user and returns the plaintext token.

  Generates a new reset token for the user identified by `user-id` and stores it in an [[AuthIdentity]] record with
  provider `support-access-grant`. The token includes the support access grant's end time, which will be used to set
  the user's password expiration when they log in.

  Parameters:
  - `user-id`: The ID of the user to create a password reset token for
  - `grant`: The support access grant map containing at minimum `:grant_end_timestamp`

  Throws an exception if:
  - The grant is nil
  - The grant has expired

  Returns the plaintext token string that should be sent to the user via email."
  [user-id :- ms/PositiveInt
   grant :- [:maybe [:map [:grant_end_timestamp ::schema/timestamp]]]]
  (when-not grant
    (throw (ex-info "Cannot create support access reset token: no grant provided"
                    {:status-code 400})))
  (let [grant-ends-at (:grant_end_timestamp grant)]
    (when (t/before? grant-ends-at (t/offset-date-time))
      (throw (ex-info "Cannot create support access reset token: grant has expired"
                      {:status-code 400})))
    (u/prog1 (auth-identity/generate-reset-token user-id)
      (t2/with-transaction [_]
        (let [user (t2/select-one :model/User user-id)
              auth-identity {:user_id user-id
                             :provider "support-access-grant"
                             :provider_id (:email user)
                             :expires_at grant-ends-at
                             :credentials (create-support-access-reset-token-credentials <> grant-ends-at)
                             :metadata (auth-identity/create-reset-token-metadata (:email user))}]
          (if-let [auth-identity-id (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider "support-access-grant")]
            (t2/update! :model/AuthIdentity auth-identity-id auth-identity)
            (t2/insert! :model/AuthIdentity auth-identity)))))))

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

;; Register support-access-grant provider in the hierarchy, deriving from emailed-secret
(derive :provider/support-access-grant :provider/emailed-secret)

;;; -------------------------------------------------- Multimethod Implementations --------------------------------------------------

(methodical/defmethod auth-identity/login! :after :provider/support-access-grant
  "Completes the support access password reset process after successful authentication.

  After a successful support access authentication, this method:
  - Marks the reset token as consumed in the [[AuthIdentity]]
  - Updates the user's password
  - Sets the user's expires_at based on the grant's end time

  All operations are performed within a transaction to ensure consistency."
  [_provider {:keys [user password auth-identity] :as result}]
  (when (:success? result)
    (let [grant-ends-at (get-in auth-identity [:credentials :grant_ends_at])]
      (log/infof "Setting password expiration for user %s to %s based on support access grant"
                 (:id user) grant-ends-at)
      (t2/with-transaction [_]
        (t2/update! :model/AuthIdentity (:id auth-identity) (auth-identity/mark-token-consumed auth-identity))
        (t2/update! :model/AuthIdentity :user_id (:id user) :provider "password"
                    {:expires_at grant-ends-at
                     :credentials {:plaintext_password password}}))))
  result)
