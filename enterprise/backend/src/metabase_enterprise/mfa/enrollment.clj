(ns metabase-enterprise.mfa.enrollment
  "Reads and writes a user's TOTP enrollment, stored in their `auth_identity` row (provider
  `\"totp\"`) inside the `:credentials` JSON. A user is enrolled only once `:confirmed_at` is
  present.

  The model's credentials transform is plain JSON, NOT encrypted-json — encryption of the TOTP
  secret is this namespace's contract: any writer of `:secret` MUST store
  `(encryption/maybe-encrypt secret)` (the read path [[stored-secret]] calls `maybe-decrypt`, which
  passes plaintext through and will silently mask a writer that forgets). No writer exists yet;
  enrollment creation arrives with the enrollment API. Recovery-code hashes and the replay/jti
  bookkeeping need no encryption — they contain no recoverable secret.

  Also owns the two pieces of one-time-use state, both kept in the same credentials map so
  enforcement is correct across multiple app nodes with no schema migration:

  - `:last_used_step` — the last accepted TOTP time step. RFC 6238 §5.2: a verifier MUST NOT
    accept the same code twice, so verification rejects any step at or before it.
  - `:used_jtis` — `[{:jti ... :exp ...}, ...]` consumed challenge-token ids, pruned by expiry,
    so one challenge token cannot mint two sessions.
  - `:recovery_codes` — bcrypt hashes of the unused recovery codes; a code is removed when used."
  (:require
   [metabase-enterprise.mfa.recovery-codes :as recovery-codes]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.util.encryption :as encryption]
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
  (some-> (get-in auth-identity [:credentials :secret]) encryption/maybe-decrypt))

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
             (recovery-attempt! auth-identity code jti)))))))

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
