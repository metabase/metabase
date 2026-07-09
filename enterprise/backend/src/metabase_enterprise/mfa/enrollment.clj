(ns metabase-enterprise.mfa.enrollment
  "Reads and writes a user's TOTP enrollment, stored in their `auth_identity` row (provider
  `\"totp\"`) inside the `:credentials` JSON, encrypted with `MB_ENCRYPTION_SECRET_KEY` when one is
  set. A user is enrolled only once `:confirmed_at` is present.

  Also owns the two pieces of one-time-use state, both kept in the same credentials map so
  enforcement is correct across multiple app nodes with no schema migration:

  - `:last_used_step` — the last accepted TOTP time step. RFC 6238 §5.2: a verifier MUST NOT
    accept the same code twice, so verification rejects any step at or before it.
  - `:used_jtis` — `[{:jti ... :exp ...}, ...]` consumed challenge-token ids, pruned by expiry,
    so one challenge token cannot mint two sessions."
  (:require
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.util.encryption :as encryption]
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

(defn- consume! [auth-identity step jti]
  (let [now         (quot (System/currentTimeMillis) 1000)
        credentials (:credentials auth-identity)
        used-jtis   (->> (:used_jtis credentials)
                         (filterv #(> (:exp % 0) now)))]
    (t2/update! :model/AuthIdentity (:id auth-identity)
                {:credentials (assoc credentials
                                     :last_used_step step
                                     :used_jtis (conj used-jtis
                                                      {:jti jti
                                                       :exp (+ now (* 2 60 60))}))})))

(defn verify-totp-attempt!
  "Verify `code` for `user-id` and atomically consume the (time step, challenge `jti`) pair.

  True only when all hold: confirmed enrollment; the code matches within the validation window;
  the matched step is strictly later than the last accepted step; and `jti` has not been used.
  Runs in a transaction with the enrollment row locked so a concurrently replayed code or token
  cannot pass twice."
  [user-id code jti]
  (t2/with-transaction [_conn]
    (boolean
     (when-let [auth-identity (t2/select-one :model/AuthIdentity
                                             :user_id user-id
                                             :provider provider-name
                                             {:for :update})]
       (let [credentials (:credentials auth-identity)
             secret      (stored-secret auth-identity)]
         (when (and (confirmed? auth-identity)
                    secret
                    (not (jti-used? credentials jti)))
           (when-let [step (totp/matching-time-step secret code)]
             (when (> step (long (:last_used_step credentials 0)))
               (consume! auth-identity step jti)
               true))))))))
