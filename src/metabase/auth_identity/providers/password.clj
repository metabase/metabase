(ns metabase.auth-identity.providers.password
  "Password authentication provider implementation."
  (:require
   [metabase.auth-identity.provider :as provider]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

;; Register password provider in the hierarchy
(derive :provider/password ::provider/provider)

;;; -------------------------------------------------- Multimethod Implementations --------------------------------------------------

;; Fake salt & hash used to run bcrypt hash if user doesn't exist, to avoid timing attacks (Metaboat #134)
(def ^:private fake-salt "ee169694-5eb6-4010-a145-3557252d7807")
(def ^:private fake-hashed-password "$2a$10$owKjTym0ZGEEZOpxM0UyjekSvt66y1VvmOJddkAaMB37e0VAIVOX2")

(methodical/defmethod provider/validate :provider/password
  "Validate password credentials before insert/update into AuthIdentity.
   Ensures password_hash and password_salt are present."
  [_provider {:keys [credentials] :as _auth-identity-data}]
  (let [{:keys [password_hash password_salt]} credentials]
    (when-not password_hash
      (throw (ex-info "password_hash is required for password provider"
                      {:error :invalid-credentials
                       :field :password_hash})))
    (when-not password_salt
      (throw (ex-info "password_salt is required for password provider"
                      {:error :invalid-credentials
                       :field :password_salt})))))

(mu/defn- find-auth-identity-by-email
  "Find an AuthIdentity record by email address."
  [email :- ms/NonBlankString]
  (when-let [user (t2/select-one :model/User :%lower.email (u/lower-case-en email))]
    (t2/select-one :model/AuthIdentity
                   :user_id (:id user)
                   :provider "password")))

(methodical/defmethod provider/authenticate :provider/password
  "Authenticate a user with email and password.

   Request format:
     {:email \"user@example.com\"
      :password \"secret123\"}

   Returns:
     Success: {:success? true
               :user-id <id>
               :auth-identity <auth-identity-record>}

     Failure: {:success? false
               :error :invalid-credentials
               :message \"...\"}"
  [_provider {:keys [email password] :as _request}]
  (log/debugf "Authenticating with password provider for email: %s" email)

  (cond
    (not email)
    {:success? false
     :error :invalid-credentials
     :message "Email is required"}

    (not password)
    {:success? false
     :error :invalid-credentials
     :message "Password is required"}

    :else
    (if-let [auth-identity (find-auth-identity-by-email email)]
      (let [{:keys [password_hash password_salt]} (:credentials auth-identity)
            password-matches? (u.password/verify-password password password_salt password_hash)]
        (if password-matches?
          {:success? true
           :user-id (:user_id auth-identity)
           :auth-identity auth-identity
           :provider-id email}
          {:success? false
           :error :invalid-credentials
           :message "Password did not match stored password."}))
      ;; Still run bcrypt to prevent timing attacks
      (do (u.password/verify-password password fake-salt fake-hashed-password)
          {:success? false
           :error :invalid-credentials
           :message "No user found with that email address."}))))
