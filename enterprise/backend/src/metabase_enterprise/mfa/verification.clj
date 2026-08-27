(ns metabase-enterprise.mfa.verification
  "Proves that a caller holds a registered second factor — 'something you have'. Owns the
  verification engine: accepting a TOTP code, a single-use recovery code, or a pending emailed
  one-time code, atomically consuming whichever credential is presented so a replayed or
  concurrently submitted credential can never pass twice.

  Row-level helpers (`provider-name`, `totp-identity`, `confirmed?`, `stored-secret`) live here
  as the lower layer; `metabase-enterprise.mfa.enrollment` requires this namespace for them.

  One-time-use state lives in the same `:credentials` JSON column as the enrollment secret:
  - `:last_used_step` — last accepted TOTP time step; RFC 6238 §5.2 requires strict monotonicity.
  - `:used_jtis`      — `[{:jti ... :exp ...}]` consumed challenge-token ids, pruned by expiry.
  - `:recovery_codes` — bcrypt hashes of unused recovery codes; removed on use.
  - `:email_otp`      — `{:hash ... :exp ...}` bcrypt hash of a pending emailed code; removed on use."
  (:require
   [metabase-enterprise.mfa.recovery-codes :as recovery-codes]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2])
  (:import
   (java.security SecureRandom)))

(set! *warn-on-reflection* true)

;; Register "totp" in the AuthIdentity provider hierarchy so the model's before-insert/-update
;; validation accepts its rows (the default `validate` method applies).
(derive :provider/totp :metabase.auth-identity.provider/provider)

(def ^:private provider-name "totp")

(defn totp-identity
  "The AuthIdentity row for `user-id`'s TOTP enrollment, or nil."
  [user-id]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider provider-name))

(defn confirmed?
  "Has `auth-identity` been confirmed (i.e. is it a usable second factor)?

  Confirmation lives in the `confirmed_at` COLUMN (not the encrypted credentials JSON) so
  enrollment state is queryable in SQL; rows written before the column existed are covered by
  the BackfillMfaConfirmedAt migration."
  [auth-identity]
  (some? (:confirmed_at auth-identity)))

(defn stored-secret
  "The TOTP secret from `auth-identity`'s credentials, or nil."
  [auth-identity]
  (get-in auth-identity [:credentials :secret]))

(defn- jti-used? [credentials jti]
  (boolean (some #(= (:jti %) jti) (:used_jtis credentials))))

(defn jti-consumed?
  "Has this challenge `jti` already been consumed by a successful verification for `user-id`?"
  [user-id jti]
  (boolean (some-> (totp-identity user-id) :credentials (jti-used? jti))))

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

(defn- write-credentials!
  "Persist a successful attempt's credential changes. Any pending emailed one-time code dies with
  the successful verification — otherwise it would stay valid for its remaining ~10-minute TTL,
  including as re-auth for disable/regenerate."
  [auth-identity credentials jti]
  (t2/update! :model/AuthIdentity (:id auth-identity)
              {:credentials (-> credentials (dissoc :email_otp) (consume-jti jti))}))

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
  "Verify a second-factor `code` — a 6-digit TOTP code, a recovery code, or a pending emailed
  one-time code — for `user-id`, atomically consuming whatever it uses: the TOTP time step, the
  recovery code, or the emailed code, plus the challenge `jti` when one is given (pass nil for
  session re-auth, where no challenge token exists).

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
        (let [code (format "%06d" (.nextInt (SecureRandom.) 1000000))]
          (t2/update! :model/AuthIdentity (:id auth-identity)
                      {:credentials (assoc (:credentials auth-identity)
                                           :email_otp {:hash (u.password/hash-bcrypt code)
                                                       :exp  (+ (quot (System/currentTimeMillis) 1000)
                                                                (* 10 60))})})
          code)))))
