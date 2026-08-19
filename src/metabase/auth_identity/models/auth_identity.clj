(ns metabase.auth-identity.models.auth-identity
  "Model definition for authentication identities. An AuthIdentity represents a method of authentication
  for a User - a User can have multiple AuthIdentities (e.g., password + SSO)."
  (:require
   [java-time.api :as t]
   [metabase.auth-identity.provider :as provider]
   [metabase.models.interface :as mi]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]
   [metabase.util.password :as u.password]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/AuthIdentity
  [_model]
  :auth_identity)

(doto :model/AuthIdentity
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.superuser))

(defn- parse-credentials-timestamps-out
  "Parse timestamp strings in credentials to java.time.Instant when reading from database."
  [credentials]
  (into {}
        (map (fn [[key value]]
               (cond-> [key value]
                 (and  (contains? #{:expires_at :consumed_at :grant_ends_at} key)
                       (string? value))
                 (update 1 t/instant))))
        credentials))

;; `credentials` is encrypted at rest (whole column) so secrets stored in it — e.g. the TOTP
;; shared secret — survive `rotate-encryption-key`, which re-encrypts whole columns and cannot
;; reach fields nested inside JSON. The column is listed in
;; `metabase.app-db.encryption/encrypted-json-columns`. Rows written before encryption was
;; introduced are plaintext JSON; `maybe-decrypt` passes them through unchanged.
(t2/deftransforms :model/AuthIdentity
  {:credentials {:in mi/encrypted-json-in
                 :out (comp parse-credentials-timestamps-out mi/encrypted-json-out)}
   :metadata mi/transform-json})

;;; ------------------------------------------------ Password Hashing ------------------------------------------------

(defn hash-password-credentials
  "Hash plaintext password in credentials if present. Returns updated credentials.

  Accepts credentials map with either:
  - :plaintext_password key (new format for AuthIdentity)
  - Both :password_hash and :password_salt already present (already hashed)

  Returns credentials map with :password_hash and :password_salt."
  [{:keys [plaintext_password password_hash password_salt] :as credentials}]
  (-> (merge credentials (cond
                           ;; Already hashed - return as is
                           (and password_hash password_salt)
                           {:password_hash password_hash
                            :password_salt password_salt}

                           ;; Has plaintext password - hash it
                           plaintext_password
                           (let [salt (str (random-uuid))
                                 hash (u.password/hash-bcrypt (str salt plaintext_password))]
                             {:password_hash hash
                              :password_salt salt})

                           ;; No password data - return empty map
                           :else
                           credentials))
      (dissoc :plaintext_password)))

(defn- ts-part
  "Normalize a timestamp field for signing: truncate to seconds and stringify so the signed value is
  identical whether it comes straight off the write path or is re-parsed from the JSON column. Nil-safe."
  [ts]
  (some-> ts t/instant (.truncatedTo java.time.temporal.ChronoUnit/SECONDS) str))

(defn- credentials-sig-parts
  "The signed tuple for an auth_identity row. Covers the secret material (`password_hash`, `token_hash`)
  and the reset-token state fields (`expires_at`, `consumed_at`) that the emailed-secret provider gates on."
  [user-id provider {:keys [password_hash token_hash expires_at consumed_at]}]
  ["auth_identity.credentials" user-id provider password_hash token_hash
   (ts-part expires_at) (ts-part consumed_at)])

(defn- credentials-signature
  "Keyed signature over [[credentials-sig-parts]]. Recomputed on the model write path."
  [user-id provider credentials]
  (apply encryption/hmac-signature (credentials-sig-parts user-id provider credentials)))

(defn credentials-signature-valid?
  "True when `auth-identity`'s `credentials_sig` verifies against its credentials, or when no signing
  secret is configured. Providers call this before honoring the stored credentials."
  [{:keys [user_id provider credentials credentials_sig]}]
  (apply encryption/hmac-signature-valid? credentials_sig
         (credentials-sig-parts user_id provider credentials)))

(defn resign-credentials-signatures!
  "Re-stamp `credentials_sig` for every auth_identity from the current row value. Run when the signing
  secret changes so existing rows stay verifiable. No-op when no secret is configured."
  []
  (when (encryption/hmac-signing-secret)
    (run! (fn [{:keys [id user_id provider credentials]}]
            (t2/query-one {:update :auth_identity
                           :set    {:credentials_sig (credentials-signature user_id provider credentials)}
                           :where  [:= :id id]}))
          ;; select through the model so `credentials` is decrypted + timestamp-parsed, matching the write path
          (t2/select :model/AuthIdentity))))

(t2/define-before-insert :model/AuthIdentity
  [{:keys [user_id provider credentials] :as auth-identity}]
  (provider/validate (provider/provider-string->keyword provider) auth-identity)
  (assoc auth-identity :credentials_sig (credentials-signature user_id provider credentials)))

(t2/define-before-update :model/AuthIdentity
  [{:keys [provider] :as auth-identity}]
  (let [creds-changed? (contains? (t2/changes auth-identity) :credentials)
        hashed         (cond-> auth-identity
                         (and (= provider "password") creds-changed?)
                         (update :credentials hash-password-credentials))]
    (provider/validate (provider/provider-string->keyword provider) hashed)
    ;; resign whenever credentials change; fetch user_id when it isn't part of this update
    (cond-> hashed
      creds-changed?
      (as-> ai (assoc ai :credentials_sig
                      (credentials-signature (or (:user_id ai)
                                                 (t2/select-one-fn :user_id :model/AuthIdentity (:id ai)))
                                             provider (:credentials ai)))))))

(t2/define-after-insert :model/AuthIdentity
  [{:keys [user_id provider credentials] :as auth-identity}]
  (when (= provider "emailed-secret-password-reset")
    (let [{:keys [token_hash expires_at consumed_at]} credentials]
      ;; Only sync to User if token is not consumed
      (when-not consumed_at
        (log/debugf "Syncing emailed-secret-password-reset AuthIdentity insert to User %s" user_id)
        ;; Calculate reset_triggered from expires_at (work backward from expiration)
        (let [ttl-ms (* 48 60 60 1000) ; 48 hours in milliseconds
              reset-triggered (-> (t/instant expires_at)
                                  (t/minus (t/millis ttl-ms))
                                  t/to-millis-from-epoch)]
          (t2/update! :model/User user_id
                      {:reset_token token_hash
                       :reset_triggered reset-triggered})))))
  auth-identity)

(t2/define-after-update :model/AuthIdentity
  [{:keys [user_id provider credentials] :as auth-identity}]
  (cond
    ;; Handle password provider - sync to User table
    (= provider "password")
    (let [{:keys [password_hash password_salt]} credentials]
      (when (and password_hash password_salt)
        (t2/update! :model/User user_id
                    {:password password_hash
                     :password_salt password_salt})))

    ;; Handle emailed-secret-password-reset provider - sync reset tokens to User table
    (= provider "emailed-secret-password-reset")
    (let [{:keys [token_hash expires_at consumed_at]} credentials]
      (log/debugf "Syncing emailed-secret-password-reset AuthIdentity update to User %s" user_id)
      (if consumed_at
        ;; Token consumed - clear User table
        (t2/update! :model/User
                    {:id user_id
                     :reset_token [:not= nil]}
                    {:reset_token nil
                     :reset_triggered nil})
        ;; Token updated - sync to User table
        (let [ttl-ms (* 48 60 60 1000)
              reset-triggered (t/to-millis-from-epoch (t/minus expires_at (t/millis ttl-ms)))]
          (t2/update! :model/User
                      {:id user_id}
                      {:reset_token token_hash
                       :reset_triggered reset-triggered})))))
  auth-identity)
