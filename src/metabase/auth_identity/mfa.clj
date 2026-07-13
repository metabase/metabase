(ns metabase.auth-identity.mfa
  "Native multi-factor authentication: the login-flow gate, short-lived challenge tokens, and the
  enrollment/management helpers.

  The TOTP secret is stored in the user's `auth_identity` row (provider `\"totp\"`) inside the
  `:credentials` JSON, encrypted with `MB_ENCRYPTION_SECRET_KEY` when one is set. A user is
  considered enrolled only once `:confirmed_at` is present.

  This namespace deliberately depends on neither `metabase.auth-identity.provider` nor
  `metabase.auth-identity.providers.totp` so that `provider` can require it for the gate without a
  load cycle."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.nonce :as nonce]
   [buddy.sign.jwt :as jwt]
   [java-time.api :as t]
   [metabase.auth-identity.settings :as mfa.settings]
   [metabase.auth-identity.totp :as totp]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private provider-name "totp")

(def ^:private interactive-providers
  "First-factor providers a native second factor applies to. SSO providers are intentionally
  excluded — their identity provider owns MFA."
  #{:provider/password :provider/ldap})

(def ^:private challenge-ttl-seconds (* 5 60))

;;; -------------------------------------------------- Challenge tokens --------------------------------------------------

;; Prototype: a per-process random signing key. Short-lived (5 min) tokens make restart
;; invalidation harmless. PRODUCTION TODO: persist this (e.g. a setting) so tokens verify across
;; restarts and multiple app nodes — see the multi-node gotcha in the design doc.
(defonce ^:private process-signing-key
  (codecs/bytes->hex (nonce/random-bytes 32)))

(defn issue-challenge-token
  "Create a short-lived signed token authorizing a second-factor attempt for `user-id`, remembering
  the first-factor `provider`."
  [user-id provider]
  (jwt/sign {:user-id  user-id
             :provider (name provider)
             :purpose  "mfa-challenge"
             :exp      (+ (quot (System/currentTimeMillis) 1000) challenge-ttl-seconds)}
            process-signing-key
            {:alg :hs256}))

(defn verify-challenge-token
  "Verify a challenge token. Returns its claims map, or nil if invalid/expired/tampered."
  [token]
  (try
    (let [claims (jwt/unsign token process-signing-key {:alg :hs256})]
      (when (= (:purpose claims) "mfa-challenge")
        claims))
    (catch Exception e
      (log/debug e "Invalid MFA challenge token")
      nil)))

;;; -------------------------------------------------- Enrollment state --------------------------------------------------

(defn- totp-identity [user-id]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider provider-name))

(defn- stored-secret [auth-identity]
  (some-> (get-in auth-identity [:credentials :secret]) encryption/maybe-decrypt))

(defn enrolled-method
  "Return the user's confirmed MFA method keyword (currently only `:totp`), or nil if not enrolled."
  [user-id]
  (when-let [ai (totp-identity user-id)]
    (when (get-in ai [:credentials :confirmed_at])
      :totp)))

(defn- upsert-totp! [user-id credentials]
  (if-let [id (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider provider-name)]
    (t2/update! :model/AuthIdentity id {:credentials credentials})
    (t2/insert! :model/AuthIdentity {:user_id user-id :provider provider-name :credentials credentials})))

(defn verify-user-password
  "Check `password` against the user's stored password credentials. Used to re-confirm identity
  before enrolling or disabling MFA."
  [user-id password]
  (boolean
   (when-let [{:keys [password_hash password_salt]} (some-> (t2/select-one :model/AuthIdentity
                                                                           :user_id user-id
                                                                           :provider "password")
                                                            :credentials)]
     (and password_hash
          (u.password/verify-password password password_salt password_hash)))))

;;; -------------------------------------------------- Management operations --------------------------------------------------

(defn mfa-enroll!
  "Start TOTP enrollment for `user-id` after re-verifying `password`. Stores a pending (unconfirmed)
  secret and returns `{:secret ... :otpauth_uri ...}` for QR display, or nil if the password is wrong."
  [user-id password]
  (when (verify-user-password user-id password)
    (let [secret (totp/generate-secret)
          email  (t2/select-one-fn :email :model/User user-id)]
      (upsert-totp! user-id {:secret (encryption/maybe-encrypt secret)})
      {:secret      secret
       :otpauth_uri (totp/otpauth-uri {:issuer "Metabase" :account email :secret secret})})))

(defn mfa-confirm-enrollment!
  "Finish enrollment by verifying a `code` against the pending secret. Returns true on success."
  [user-id code]
  (boolean
   (when-let [ai (totp-identity user-id)]
     (let [secret (stored-secret ai)]
       (when (and secret (totp/valid-code? secret code))
         (t2/update! :model/AuthIdentity (:id ai)
                     {:credentials (assoc (:credentials ai) :confirmed_at (t/instant))})
         true)))))

(defn mfa-disable!
  "Disable TOTP for `user-id` after re-verifying `password`. Returns true on success."
  [user-id password]
  (when (verify-user-password user-id password)
    (t2/delete! :model/AuthIdentity :user_id user-id :provider provider-name)
    true))

(defn mfa-admin-reset!
  "Clear a user's TOTP enrollment (lockout recovery; caller must enforce superuser)."
  [user-id]
  (t2/delete! :model/AuthIdentity :user_id user-id :provider provider-name))

(defn set-mfa-admin-settings!
  "Toggle the global MFA settings (caller must enforce superuser). Each key is optional."
  [{:keys [enabled required]}]
  (when (some? enabled)  (mfa.settings/mfa-enabled! enabled))
  (when (some? required) (mfa.settings/mfa-required! required)))

(defn mfa-status
  "MFA status for the current user, for the account-settings UI."
  [user-id]
  (let [method (enrolled-method user-id)]
    {:enabled  (mfa.settings/mfa-enabled)
     :required (mfa.settings/mfa-required)
     :enrolled (boolean method)
     :method   (some-> method name)}))

;;; -------------------------------------------------- Login-flow gate --------------------------------------------------

(defn mfa-pending?
  "True when a login result is awaiting a second factor, so no session should be created yet."
  [result]
  (contains? #{:mfa-required :enrollment-required} (:success? result)))

(defn apply-mfa-gate
  "Given the in-progress `login!` result map, decide whether a second factor is required.

  Returns the map unchanged when MFA does not apply (feature off, non-interactive/SSO provider, or
  the user isn't enrolled and isn't required to be). Otherwise sets `:success?` to `:mfa-required`
  (enrolled) or `:enrollment-required` (forced enrollment) and attaches a challenge token. The
  default no-op path means existing logins are untouched until an admin turns the feature on."
  [provider {:keys [user] :as result}]
  (if (and (true? (:success? result))
           user
           (contains? interactive-providers provider)
           (mfa.settings/mfa-enabled))
    (let [user-id (:id user)]
      (cond
        (enrolled-method user-id)
        (assoc result
               :success?     :mfa-required
               :mfa-required true
               :mfa-method   (name (enrolled-method user-id))
               :mfa-token    (issue-challenge-token user-id provider))

        (mfa.settings/mfa-required)
        (assoc result
               :success?           :enrollment-required
               :mfa-required       true
               :mfa-enroll-required true
               :mfa-token          (issue-challenge-token user-id provider))

        :else result))
    result))
