(ns metabase.auth-identity.models.auth-identity
  "Model definition for authentication identities. An AuthIdentity represents a method of authentication
  for a User - a User can have multiple AuthIdentities (e.g., password + SSO)."
  (:require
   [java-time.api :as t]
   [metabase.auth-identity.provider :as provider]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
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

(t2/deftransforms :model/AuthIdentity
  {:credentials {:in mi/json-in
                 :out (comp parse-credentials-timestamps-out mi/json-out-with-keywordization)}
   :metadata mi/transform-json})

(defmethod serdes/hash-fields :model/AuthIdentity
  [_auth-identity]
  [:user_id :provider :created_at])

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

(t2/define-before-insert :model/AuthIdentity
  [{:keys [provider] :as auth-identity}]
  (provider/validate (provider/provider-string->keyword provider) auth-identity)
  auth-identity)

(t2/define-before-update :model/AuthIdentity
  [{:keys [provider] :as auth-identity}]
  (u/prog1 (cond-> auth-identity
             (and (= provider "password")
                  (contains? (t2/changes auth-identity) :credentials))
             (update :credentials hash-password-credentials))
    (provider/validate (provider/provider-string->keyword provider) <>)))

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
