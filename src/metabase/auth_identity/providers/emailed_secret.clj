(ns metabase.auth-identity.providers.emailed-secret
  "Provider for emailed secret tokens (password reset, email verification, magic links)."
  (:require
   [java-time.api :as t]
   [metabase.auth-identity.provider :as provider]
   [metabase.channel.email.messages :as messages]
   [metabase.events.core :as events]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn create-reset-token-credentials
  "Creates a credentials map for a password reset token with hashed token and expiration.

  The `token` is the plaintext reset token that will be hashed using bcrypt. The optional `expires-in-ms` parameter
  sets the token TTL in milliseconds (defaults to 48 hours). Returns a map containing `:token_hash`, `:expires_at`,
  and `:consumed_at` (initially nil)."
  [token :- :string
   & {:keys [expires-in-ms]
      :or {expires-in-ms (* 48 60 60 1000)}}]
  {:token_hash (u.password/hash-bcrypt token)
   :expires_at (t/plus (t/instant) (t/millis expires-in-ms))
   :consumed_at nil})

(mu/defn create-reset-token-metadata
  "Creates a metadata map for a password reset token containing the user's email and optional request context.

  The `email` parameter is the user's email address. Optional keyword arguments `ip-address` and `user-agent` capture
  request context information. Returns a map with `:email`, `:ip_address`, and `:request_context` (containing
  `:user_agent` and `:timestamp`)."
  [email :- ms/Email
   & {:keys [ip-address user-agent]}]
  {:email email
   :ip_address ip-address
   :request_context {:user_agent user-agent
                     :timestamp (t/instant)}})

(mu/defn- verify-reset-token :- [:enum :valid :expired :consumed :invalid]
  "Verifies a password reset token against stored credentials.

  Checks the `token` against the provided `credentials` map and returns one of:
  - `:valid` if the token matches and hasn't expired or been consumed
  - `:expired` if the token matches but has passed its expiration time
  - `:consumed` if the token has already been used
  - `:invalid` if the token doesn't match the stored hash"
  [token :- :string
   credentials :- [:map
                   [:token_hash :string]
                   [:expires_at inst?]
                   [:consumed_at [:maybe inst?]]]]
  (cond
    (:consumed_at credentials)
    :consumed
    (t/after? (t/instant) (:expires_at credentials))
    :expired
    (u.password/bcrypt-verify token (:token_hash credentials))
    :valid
    :else
    :invalid))

(mu/defn mark-token-consumed :- [:map [:credentials :map]]
  "Marks a token as consumed by setting the `:consumed_at` timestamp in the auth-identity's credentials.

  Takes an `auth-identity` map and returns an updated version with the current instant set as the `:consumed_at`
  value in the credentials map."
  [auth-identity :- [:map [:credentials :map]]]
  (assoc-in auth-identity [:credentials :consumed_at] (t/instant)))

(mu/defn- parse-token-user-id :- [:maybe ms/PositiveInt]
  "Extracts the user ID from a password reset token.

  Password reset tokens follow the format `USER-ID_RANDOM-UUID` (e.g., `123_abc-def-ghi`). Returns the user ID as an
  integer if the token matches this format, or nil if the token format is invalid."
  [token :- :string]
  (when-let [[_ user-id-str] (re-matches #"(^\d+)_.+$" token)]
    (try
      (Integer/parseInt user-id-str)
      (catch NumberFormatException _
        nil))))

(mu/defn generate-reset-token :- :string
  "Generates a password reset token for a user.

  The token format is `USER-ID_RANDOM-UUID`, which allows efficient user lookup while maintaining uniqueness and
  unpredictability."
  [user-id :- ms/PositiveInt]
  (str user-id \_ (random-uuid)))

(mu/defn create-password-reset! :- :string
  "Creates or updates a password reset token for a user and returns the plaintext token.

  Generates a new reset token for the user identified by `user-id` and stores it in an [[AuthIdentity]] record with
  provider `emailed-secret-password-reset`. If an AuthIdentity already exists for this user and provider, it will be
  updated with the new token; otherwise a new AuthIdentity is created. The token is hashed before storage and
  configured to expire in 48 hours.

  Returns the plaintext token string that should be sent to the user via email."
  [user-id :- ms/PositiveInt]
  (u/prog1 (generate-reset-token user-id)
    (t2/with-transaction [_]
      (let [user (t2/select-one :model/User user-id)
            auth-identity {:user_id user-id
                           :provider "emailed-secret-password-reset"
                           :provider_id (:email user)
                           :credentials (create-reset-token-credentials <>)
                           :metadata (create-reset-token-metadata (:email user))}]
        (if-let [auth-identity-id (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider "emailed-secret-password-reset")]
          (t2/update! :model/AuthIdentity auth-identity-id auth-identity)
          (t2/insert! :model/AuthIdentity auth-identity))))))

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

;; Register emailed_secret provider in the hierarchy
(derive :provider/emailed-secret :metabase.auth-identity.provider/provider)
(derive :provider/emailed-secret-password-reset :provider/emailed-secret)

;;; -------------------------------------------------- Multimethod Implementations --------------------------------------------------

(methodical/defmethod provider/authenticate :provider/emailed-secret
  "Authenticates a user using a password reset token.

  The request map should contain a `:token` key with a password reset token in the format `USER-ID_RANDOM-UUID`.
  Validates the token by checking it against the stored [[AuthIdentity]] credentials, verifying it hasn't expired or
  been consumed.

  Returns a map with `:success?` true and `:user-id` and `:auth-identity` on success, or `:success?` false with an
  `:error` keyword (`:invalid-token`, `:expired-token`, `:consumed-token`, `:no-auth-identity`, or `:server-error`)
  and human-readable `:message` on failure."
  [provider {:keys [token]}]
  (log/debug "Authenticating with emailed_secret provider for token")
  (cond
    (not token)
    {:success? false
     :error :invalid-request
     :message "Reset token is required"}
    :else
    (try
      (if-let [user-id (parse-token-user-id token)]
        (if-let [auth-identity (t2/select-one :model/AuthIdentity
                                              :user_id user-id
                                              :provider (name provider))]
          (let [verification-result (verify-reset-token token (:credentials auth-identity))]
            (case verification-result
              :valid
              (do
                (log/debugf "Valid reset token for user %s" user-id)
                {:success? true
                 :user-id user-id
                 :auth-identity auth-identity})
              :expired
              {:success? false
               :error :expired-token
               :message "Reset token has expired"}
              :consumed
              {:success? false
               :error :consumed-token
               :message "Reset token has already been used"}
              :invalid
              {:success? false
               :error :invalid-token
               :message "Reset token is invalid"}))
          {:success? false
           :error :no-auth-identity
           :message "No reset token found for this user"})
        {:success? false
         :error :invalid-token
         :message "Invalid token format"})
      (catch Exception e
        (log/error e "Unexpected error during reset token verification")
        {:success? false
         :error :server-error
         :message "An unexpected error occurred during token verification"}))))

(methodical/defmethod provider/login! :after :provider/emailed-secret-password-reset
  "Completes the password reset process after successful authentication.

  After a successful password reset authentication, this method:
  - Publishes a password reset event or sends admin notification (for new users)
  - Marks the reset token as consumed in the [[AuthIdentity]]
  - Updates the user's password

  All operations are performed within a transaction to ensure consistency."
  [_provider {:keys [user password auth-identity] :as result}]
  (when (:success? result)
    (if (:last_login user)
      (events/publish-event! :event/password-reset-successful {:object (assoc user :token (t2/select-one-fn :reset_token :model/User (:id user)))})
      (messages/send-user-joined-admin-notification-email! (t2/select-one :model/User (:id user))))
    (t2/with-transaction [_]
      (t2/update! :model/AuthIdentity (:id auth-identity) (mark-token-consumed auth-identity))
      (t2/update! :model/User (:id user) {:password password})))
  result)
