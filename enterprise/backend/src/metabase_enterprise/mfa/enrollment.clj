(ns metabase-enterprise.mfa.enrollment
  "Reads and writes a user's TOTP enrollment, stored in their `auth_identity` row (provider
  `\"totp\"`) inside the `:credentials` JSON. A user is enrolled only once `:confirmed_at` is
  present.

  Encryption at rest is the model's responsibility, not this namespace's: `:credentials` is
  whole-column encrypted-json (see the `:model/AuthIdentity` transforms) and covered by
  `rotate-encryption-key`, so code here reads and writes plaintext maps. Do NOT `maybe-encrypt`
  individual fields — a field encrypted inside the JSON is invisible to key rotation and dies
  with the old key.

  Also owns the two pieces of one-time-use state, both kept in the same credentials map so
  enforcement is correct across multiple app nodes with no schema migration:

  - `:last_used_step` — the last accepted TOTP time step. RFC 6238 §5.2: a verifier MUST NOT
    accept the same code twice, so verification rejects any step at or before it.
  - `:used_jtis` — `[{:jti ... :exp ...}, ...]` consumed challenge-token ids, pruned by expiry,
    so one challenge token cannot mint two sessions.
  - `:recovery_codes` — bcrypt hashes of the unused recovery codes; a code is removed when used."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.mfa.recovery-codes :as recovery-codes]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Register "totp" in the AuthIdentity provider hierarchy so the model's before-insert/-update
;; validation accepts its rows (the default `validate` method applies).
(derive :provider/totp :metabase.auth-identity.provider/provider)

(def ^:private provider-name "totp")

(defn- totp-identity [user-id]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider provider-name))

(defn- confirmed? [auth-identity]
  (some? (get-in auth-identity [:credentials :confirmed_at])))

(defn- stored-secret [auth-identity]
  (get-in auth-identity [:credentials :secret]))

(defn enrolled-method
  "The user's confirmed MFA method keyword (currently only `:totp`), or nil if not enrolled."
  [user-id]
  (when (some-> (totp-identity user-id) confirmed?)
    :totp))

(defn- jti-used? [credentials jti]
  (boolean (some #(= (:jti %) jti) (:used_jtis credentials))))

(defn- consume-jti
  "Record `jti` as used (nil jti = session re-auth, nothing to record), pruning expired entries."
  [credentials jti]
  (if-not jti
    credentials
    (let [now (quot (System/currentTimeMillis) 1000)]
      (update credentials :used_jtis
              (fn [jtis]
                (conj (filterv #(> (:exp % 0) now) jtis)
                      {:jti jti :exp (+ now (* 2 60 60))}))))))

(defn- write-credentials! [auth-identity credentials jti]
  (t2/update! :model/AuthIdentity (:id auth-identity)
              {:credentials (consume-jti credentials jti)}))

(defn- totp-attempt!
  "When `code` is a valid, not-yet-used TOTP code: consume its time step (RFC 6238 §5.2) and return
  true."
  [auth-identity code jti]
  (let [credentials (:credentials auth-identity)]
    (when-let [secret (stored-secret auth-identity)]
      (when-let [step (totp/matching-time-step secret code)]
        (when (> step (long (:last_used_step credentials 0)))
          (write-credentials! auth-identity (assoc credentials :last_used_step step) jti)
          true)))))

(defn- recovery-attempt!
  "When `code` matches one of the stored (bcrypt-hashed) recovery codes: remove it — single-use —
  and return true."
  [auth-identity code jti]
  (when (recovery-codes/recovery-code? code)
    (let [credentials (:credentials auth-identity)
          hashes      (:recovery_codes credentials)]
      (when-let [used (first (filter #(u.password/bcrypt-verify code %) hashes))]
        (write-credentials! auth-identity
                            (assoc credentials :recovery_codes (filterv #(not= used %) hashes))
                            jti)
        true))))

(defn- email-otp-attempt!
  "When `code` matches the pending (bcrypt-hashed, 10-minute) emailed one-time code: consume it —
  single-use — and return true."
  [auth-identity code jti]
  (let [{:keys [hash exp]} (get-in auth-identity [:credentials :email_otp])
        now                (quot (System/currentTimeMillis) 1000)]
    (when (and hash
               (> (long (or exp 0)) now)
               (string? code)
               (re-matches #"\d{6}" code)
               (u.password/bcrypt-verify code hash))
      (write-credentials! auth-identity
                          (dissoc (:credentials auth-identity) :email_otp)
                          jti)
      true)))

(defn verify-attempt!
  "Verify a second-factor `code` — a 6-digit TOTP code or a recovery code — for `user-id`,
  atomically consuming whatever it uses: the TOTP time step or the recovery code, plus the
  challenge `jti` when one is given (pass nil for session re-auth, where no challenge token
  exists).

  True only for a confirmed enrollment with an unused jti and an unconsumed code. Runs in a
  transaction with the enrollment row locked so a concurrently replayed code, recovery code, or
  token cannot pass twice."
  [user-id code jti]
  (t2/with-transaction [_conn]
    (boolean
     (when-let [auth-identity (t2/select-one :model/AuthIdentity
                                             :user_id user-id
                                             :provider provider-name
                                             {:for :update})]
       (when (and (confirmed? auth-identity)
                  (not (jti-used? (:credentials auth-identity) jti)))
         (or (totp-attempt! auth-identity code jti)
             (recovery-attempt! auth-identity code jti)
             (email-otp-attempt! auth-identity code jti)))))))

(defn set-email-otp!
  "Generate a 6-digit emailed one-time code for `user-id`'s confirmed enrollment, replacing any
  pending one. Stored bcrypt-hashed with a 10-minute expiry; single-use. Returns the plaintext
  code for the caller to email, or nil when the user has no confirmed enrollment."
  [user-id]
  (t2/with-transaction [_conn]
    (when-let [auth-identity (t2/select-one :model/AuthIdentity
                                            :user_id user-id
                                            :provider provider-name
                                            {:for :update})]
      (when (confirmed? auth-identity)
        (let [code (format "%06d" (.nextInt (java.security.SecureRandom.) 1000000))]
          (t2/update! :model/AuthIdentity (:id auth-identity)
                      {:credentials (assoc (:credentials auth-identity)
                                           :email_otp {:hash (u.password/hash-bcrypt code)
                                                       :exp  (+ (quot (System/currentTimeMillis) 1000)
                                                                (* 10 60))})})
          code)))))

;;; -------------------------------------------------- Enrollment lifecycle --------------------------------------------------

(defn pending?
  "Does `user-id` have a started-but-unconfirmed enrollment?"
  [user-id]
  (boolean (some-> (totp-identity user-id) confirmed? not)))

(defn start-enrollment!
  "Start (or restart a pending) TOTP enrollment for `user-id`: generate a fresh secret and store it
  pending confirmation (the model encrypts the credentials column at rest). Returns the plaintext
  secret for QR display, or nil when the user already has a *confirmed* enrollment (disable it
  first — silently replacing a working second factor would let a session thief swap in their own
  authenticator)."
  [user-id]
  (t2/with-transaction [_conn]
    (let [auth-identity (t2/select-one :model/AuthIdentity
                                       :user_id user-id
                                       :provider provider-name
                                       {:for :update})]
      (when-not (some-> auth-identity confirmed?)
        (let [secret      (totp/generate-secret)
              credentials {:secret secret}]
          (if auth-identity
            (t2/update! :model/AuthIdentity (:id auth-identity) {:credentials credentials})
            (t2/insert! :model/AuthIdentity {:user_id     user-id
                                             :provider    provider-name
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
                                            :provider provider-name
                                            {:for :update})]
      (when-not (confirmed? auth-identity)
        (when-let [secret (stored-secret auth-identity)]
          (when-let [step (totp/matching-time-step secret code)]
            (let [codes (recovery-codes/generate-codes)]
              (t2/update! :model/AuthIdentity (:id auth-identity)
                          {:credentials (assoc (:credentials auth-identity)
                                               :confirmed_at   (t/instant)
                                               :last_used_step step
                                               :recovery_codes (mapv u.password/hash-bcrypt codes))})
              codes)))))))

(defn disable!
  "Remove `user-id`'s TOTP enrollment entirely (re-auth is the caller's responsibility). True when
  something was removed."
  [user-id]
  (pos? (t2/delete! :model/AuthIdentity :user_id user-id :provider provider-name)))

;;; -------------------------------------------------- Recovery-code management --------------------------------------------------

(defn reset-recovery-codes!
  "Generate a fresh recovery-code set for `user-id`'s confirmed enrollment, replacing (and thereby
  invalidating) the entire previous set. Returns the plaintext codes — the only time they exist in
  plaintext; only bcrypt hashes are stored. Nil when the user has no confirmed enrollment."
  [user-id]
  (t2/with-transaction [_conn]
    (when-let [auth-identity (t2/select-one :model/AuthIdentity
                                            :user_id user-id
                                            :provider provider-name
                                            {:for :update})]
      (when (confirmed? auth-identity)
        (let [codes (recovery-codes/generate-codes)]
          (t2/update! :model/AuthIdentity (:id auth-identity)
                      {:credentials (assoc (:credentials auth-identity)
                                           :recovery_codes (mapv u.password/hash-bcrypt codes))})
          codes)))))

(defn recovery-codes-remaining
  "How many unused recovery codes `user-id` has left."
  [user-id]
  (count (get-in (totp-identity user-id) [:credentials :recovery_codes])))
