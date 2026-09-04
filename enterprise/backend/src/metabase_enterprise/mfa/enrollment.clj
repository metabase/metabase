(ns metabase-enterprise.mfa.enrollment
  "Manages the lifecycle of a user's TOTP enrollment: starting, confirming, disabling, and
  regenerating recovery codes. State is stored in the user's `auth_identity` row (provider
  `\"totp\"`) inside the `:credentials` JSON column.

  A user is enrolled only once `:confirmed_at` is present. Encryption at rest is the model's
  responsibility, not this namespace's: `:credentials` is whole-column encrypted-json (see the
  `:model/AuthIdentity` transforms) and covered by `rotate-encryption-key`, so code here reads and
  writes plaintext maps. Do NOT `maybe-encrypt` individual fields — a field encrypted inside the
  JSON is invisible to key rotation and dies with the old key.

  Verification (proving you hold the factor) lives in
  `metabase-enterprise.mfa.verification`."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.mfa.db :as mfa.db]
   [metabase-enterprise.mfa.recovery-codes :as recovery-codes]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.appearance.core :as appearance]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn enrolled-method
  "The user's confirmed MFA method keyword (currently only `:totp`), or nil if not enrolled."
  [user-id]
  (when (some-> (verification/totp-identity user-id) verification/confirmed?)
    :totp))

;;; -------------------------------------------------- Enrollment lifecycle --------------------------------------------------

(defn pending?
  "Does `user-id` have a started-but-unconfirmed enrollment?"
  [user-id]
  (boolean (some-> (verification/totp-identity user-id) verification/confirmed? not)))

(defn start-enrollment!
  "Start (or restart a pending) TOTP enrollment for `user-id`: generate a fresh secret and store it
  pending confirmation (the model encrypts the credentials column at rest).

  Precondition: Caller is responsible for checking that the request legitimately comes from `user-id`. Either the
  user should already be logged in (and we should require and validate their password too), or they have just
  entered their password during login, and the instance requires MFA but they're not enrolled yet.

  Returns a map with the the plaintext `:secret` and `:otpauth_uri` for use as a QR code; or nil if the user
  already has a *confirmed* enrollment.

  Disable any existing enrollment first, if you want to re-enroll. Silently replacing a confirmed second factor with
  a new enrollment would let a thief swap in their own authenticator."
  [user-id]
  (t2/with-transaction [_conn]
    ;; serialize concurrent enrollments for the same user by locking the User row: with no totp
    ;; row yet there is nothing else to lock, and racing inserts would abort the transaction on
    ;; the unique (user_id, provider) constraint
    (let [user          (mfa.db/lock-user user-id)
          auth-identity (mfa.db/lock-totp-identity user-id)]
      (when-not (some-> auth-identity verification/confirmed?)
        (let [secret      (totp/generate-secret)
              credentials {:secret secret}]
          (if auth-identity
            (mfa.db/update-auth-identity! (:id auth-identity) {:credentials credentials})
            (mfa.db/insert-auth-identity! {:user_id     user-id
                                           :provider    "totp"
                                           :credentials credentials}))
          {:secret      secret
           :otpauth_uri (totp/otpauth-uri {:issuer (or (appearance/site-name) "Metabase")
                                           :account (:email user)
                                           :secret  secret})})))))

(defn confirm-enrollment!
  "Confirm a pending enrollment by verifying a live `code` against the pending secret. On success
  marks the enrollment confirmed, consumes the code's time step (so it can't also complete a
  login), generates the recovery-code set, and returns the plaintext recovery codes. Nil on
  failure or when there is no pending enrollment.

  Accepts an optional `jti`. Ignored if nil, but if present the `jti` will be atomically checked and
  consumed in the same transaction **if** the enrollment is successful. That prevents using a single
  password entry for multiple enrollments. Failed enrollment does not consume the `jti`, which allows
  e.g. a typo'd OTP to be retried."
  ([user-id code] (confirm-enrollment! user-id code nil))
  ([user-id code jti]
   (t2/with-transaction [_conn]
     (when-let [auth-identity (mfa.db/lock-totp-identity user-id)]
       (when-not (verification/confirmed? auth-identity)
         (when-not (verification/jti-used? (:credentials auth-identity) jti)
           (when-let [secret (verification/stored-secret auth-identity)]
             (when-let [step (totp/matching-time-step secret code)]
               (let [codes (recovery-codes/generate-codes)]
                 (mfa.db/update-auth-identity! (:id auth-identity)
                                               {:confirmed_at (t/instant)
                                                :credentials  (assoc (:credentials auth-identity)
                                                                     :last_used_step step
                                                                     :recovery_codes (mapv u.password/hash-bcrypt codes))})
                 {:recovery-codes       codes
                  :mfa-auth-identity-id (:id auth-identity)})))))))))

(defn disable!
  "Remove `user-id`'s TOTP enrollment entirely (re-auth is the caller's responsibility). True when
  something was removed."
  [user-id]
  (pos? (mfa.db/delete-totp-identity! user-id)))

;;; -------------------------------------------------- Recovery-code management --------------------------------------------------

(defn reset-recovery-codes!
  "Generate a fresh recovery-code set for `user-id`'s confirmed enrollment, replacing (and thereby
  invalidating) the entire previous set. Returns the plaintext codes — the only time they exist in
  plaintext; only bcrypt hashes are stored. Nil when the user has no confirmed enrollment."
  [user-id]
  (t2/with-transaction [_conn]
    (when-let [auth-identity (mfa.db/lock-totp-identity user-id)]
      (when (verification/confirmed? auth-identity)
        (let [codes (recovery-codes/generate-codes)]
          (mfa.db/update-auth-identity! (:id auth-identity)
                                        {:credentials (assoc (:credentials auth-identity)
                                                             :recovery_codes (mapv u.password/hash-bcrypt codes))})
          codes)))))

(defn recovery-codes-remaining
  "How many unused recovery codes `user-id` has left."
  [user-id]
  (count (get-in (verification/totp-identity user-id) [:credentials :recovery_codes])))
