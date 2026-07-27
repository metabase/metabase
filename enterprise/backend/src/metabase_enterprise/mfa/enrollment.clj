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
   [metabase-enterprise.mfa.recovery-codes :as recovery-codes]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase-enterprise.mfa.verification :as verification]
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
  pending confirmation (the model encrypts the credentials column at rest). Returns the plaintext
  secret for QR display, or nil when the user already has a *confirmed* enrollment (disable it
  first — silently replacing a working second factor would let a session thief swap in their own
  authenticator)."
  [user-id]
  (t2/with-transaction [_conn]
    ;; serialize concurrent enrollments for the same user by locking the User row: with no totp
    ;; row yet there is nothing else to lock, and racing inserts would abort the transaction on
    ;; the unique (user_id, provider) constraint
    (t2/select-one [:model/User :id] :id user-id {:for :update})
    (let [auth-identity (t2/select-one :model/AuthIdentity
                                       :user_id user-id
                                       :provider "totp"
                                       {:for :update})]
      (when-not (some-> auth-identity verification/confirmed?)
        (let [secret      (totp/generate-secret)
              credentials {:secret secret}]
          (if auth-identity
            (t2/update! :model/AuthIdentity (:id auth-identity) {:credentials credentials})
            (t2/insert! :model/AuthIdentity {:user_id     user-id
                                             :provider    "totp"
                                             :credentials credentials}))
          secret)))))

(defn confirm-enrollment!
  "Confirm a pending enrollment by verifying a live `code` against the pending secret. On success
  marks the enrollment confirmed, consumes the code's time step (so it can't also complete a
  login), generates the recovery-code set, and returns the plaintext recovery codes. Nil on
  failure or when there is no pending enrollment."
  [user-id code]
  (t2/with-transaction [_conn]
    (when-let [auth-identity (t2/select-one :model/AuthIdentity
                                            :user_id user-id
                                            :provider "totp"
                                            {:for :update})]
      (when-not (verification/confirmed? auth-identity)
        (when-let [secret (verification/stored-secret auth-identity)]
          (when-let [step (totp/matching-time-step secret code)]
            (let [codes (recovery-codes/generate-codes)]
              (t2/update! :model/AuthIdentity (:id auth-identity)
                          {:confirmed_at (t/instant)
                           :credentials  (assoc (:credentials auth-identity)
                                                :last_used_step step
                                                :recovery_codes (mapv u.password/hash-bcrypt codes))})
              codes)))))))

(defn disable!
  "Remove `user-id`'s TOTP enrollment entirely (re-auth is the caller's responsibility). True when
  something was removed."
  [user-id]
  (pos? (t2/delete! :model/AuthIdentity :user_id user-id :provider "totp")))

;;; -------------------------------------------------- Recovery-code management --------------------------------------------------

(defn reset-recovery-codes!
  "Generate a fresh recovery-code set for `user-id`'s confirmed enrollment, replacing (and thereby
  invalidating) the entire previous set. Returns the plaintext codes — the only time they exist in
  plaintext; only bcrypt hashes are stored. Nil when the user has no confirmed enrollment."
  [user-id]
  (t2/with-transaction [_conn]
    (when-let [auth-identity (t2/select-one :model/AuthIdentity
                                            :user_id user-id
                                            :provider "totp"
                                            {:for :update})]
      (when (verification/confirmed? auth-identity)
        (let [codes (recovery-codes/generate-codes)]
          (t2/update! :model/AuthIdentity (:id auth-identity)
                      {:credentials (assoc (:credentials auth-identity)
                                           :recovery_codes (mapv u.password/hash-bcrypt codes))})
          codes)))))

(defn recovery-codes-remaining
  "How many unused recovery codes `user-id` has left."
  [user-id]
  (count (get-in (verification/totp-identity user-id) [:credentials :recovery_codes])))
