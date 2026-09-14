(ns metabase.auth-identity.models.auth-identity
  "Model definition for authentication identities. An AuthIdentity represents a method of authentication
  for a User - a User can have multiple AuthIdentities (e.g., password + SSO)."
  (:require
   [java-time.api :as t]
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.auth-identity.provider :as provider]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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
;; `metabase.app-db.encryption/encrypted-string-columns`.
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

(t2/define-before-insert :model/AuthIdentity
  [{:keys [provider] :as auth-identity}]
  (u/prog1 (cond-> auth-identity
             (and (= provider "password")
                  (contains? auth-identity :credentials))
             (update :credentials hash-password-credentials))
    (provider/validate (provider/provider-string->keyword provider) <>)))

(t2/define-before-update :model/AuthIdentity
  [{:keys [provider] :as auth-identity}]
  (u/prog1 (cond-> auth-identity
             (and (= provider "password")
                  (contains? (t2/changes auth-identity) :credentials))
             (update :credentials hash-password-credentials))
    (provider/validate (provider/provider-string->keyword provider) <>)))

(mu/defn set-password!
  "Set `user-id`'s login password to plaintext `password`, creating or replacing their `password` AuthIdentity — the
  authoritative credential store. This is the only supported way to set a user's password; the User model itself no
  longer stores, hashes, or mirrors passwords.

  Always deletes the user's existing sessions: changing a password must invalidate every session authenticated with the
  old one. A caller that wants the acting user to stay logged in should create a fresh session afterward.

  Also deletes the user's `emailed-secret-password-reset` AuthIdentity: this is called by the password-reset flow, so
  once the password has been set the reset token must stop working — otherwise it could be replayed to reset the
  password again until it expires.

  `opts` may contain `:expires-at`, an instant after which the credential is no longer valid (used by time-limited
  support-access grants)."
  ([user-id  :- ms/PositiveInt
    password :- ms/NonBlankString]
   (set-password! user-id password nil))

  ([user-id  :- ms/PositiveInt
    password :- ms/NonBlankString
    opts     :- [:maybe
                 [:map
                  [:expires-at {:optional true} [:maybe (ms/InstanceOfClass java.time.temporal.Temporal)]]]]]
   ;; always write :expires_at (nil unless an expiry was requested) so setting a password clears any stale expiry a
   ;; prior support-access grant left behind — otherwise `authenticate` would reject the new password as expired
   ;; the credential write and the session delete must be atomic: if either fails the password must not change while
   ;; sessions authenticated with the old one survive
   (t2/with-transaction [_]
     (let [attrs {:credentials {:plaintext_password password}
                  :expires_at  (:expires-at opts)}]
       (if-let [pw-auth-identity (auth-identity.db/auth-identity user-id "password")]
         (auth-identity.db/update-auth-identity! (u/the-id pw-auth-identity) attrs)
         (auth-identity.db/insert-auth-identity! (merge {:user_id user-id, :provider "password"} attrs))))
     (auth-identity.db/delete-auth-identities! user-id "emailed-secret-password-reset")
     (auth-identity.db/delete-sessions-for-user! user-id))))

(mu/defn reset-token-hash :- [:maybe :string]
  "The bcrypt hash of `user-id`'s current password-reset token, taken from their `emailed-secret-password-reset`
  AuthIdentity (the authoritative store), or nil if they have none. Lets callers include the token in audit events
  without reading the legacy `core_user.reset_token` column."
  [user-id :- ms/PositiveInt]
  (get-in (auth-identity.db/auth-identity user-id "emailed-secret-password-reset")
          [:credentials :token_hash]))
