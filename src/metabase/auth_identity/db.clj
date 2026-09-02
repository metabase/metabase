(ns metabase.auth-identity.db
  "Application database queries for the auth identity module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn auth-identity
  "The AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id provider]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider provider))

(defn auth-identity-id
  "The id of the AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id provider]
  (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider provider))

(defn auth-identity-expiry
  "The id and expiry of the AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id provider]
  (t2/select-one [:model/AuthIdentity :id :expires_at] :user_id user-id :provider provider))

(defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity at `provider`."
  [user-id provider]
  (t2/exists? :model/AuthIdentity :user_id user-id :provider provider))

(defn insert-auth-identity!
  "Insert the AuthIdentity `row`."
  [row]
  (t2/insert! :model/AuthIdentity row))

(defn update-auth-identity!
  "Apply `changes` to the AuthIdentity with `id`."
  [id changes]
  (t2/update! :model/AuthIdentity id changes))

(defn touch-auth-identity!
  "Set `last_used_at` of the AuthIdentity with `id` to now."
  [id]
  (t2/update! :model/AuthIdentity id {:last_used_at :%now}))

(defn delete-auth-identities!
  "Delete the AuthIdentities of the User with `user-id` at `provider`."
  [user-id provider]
  (t2/delete! :model/AuthIdentity :user_id user-id :provider provider))

(defn delete-sessions-for-user!
  "Delete every Session of the User with `user-id`."
  [user-id]
  (t2/delete! :model/Session :user_id user-id))

(defn user
  "The User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/User user-id))

(defn user-by-lower-email
  "The User whose lower-cased email is `lower-case-email`, or nil."
  [lower-case-email]
  (t2/select-one :model/User :%lower.email lower-case-email))

(defn user-login-columns
  "The id, active flag, last login, and tenant id of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id))

(defn user-login-columns-by-lower-email
  "The id, active flag, last login, and tenant id of the User whose lower-cased email is `lower-case-email`, or nil."
  [lower-case-email]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :%lower.email lower-case-email))

(defn user-login-status
  "The id, active flag, and last login of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :id :is_active :last_login] user-id))

(defn user-active?
  "Whether the User with `user-id` is active."
  [user-id]
  (t2/select-one-fn :is_active :model/User :id user-id))

(defn update-user!
  "Apply `changes` to the User with `user-id`."
  [user-id changes]
  (t2/update! :model/User user-id changes))

(defn insert-user-returning-login-columns!
  "Insert the User `row` and return its id, last login, active flag, and tenant id."
  [row]
  (t2/insert-returning-instance! [:model/User :id :last_login :is_active :tenant_id] row))

(defn insert-session!
  "Insert a Session and return the inserted instance."
  [session-id user-id auth-identity-id session-key expires-at]
  (t2/insert-returning-instance! :model/Session
                                 ;; Without setting the ID here we can't return an instance on MySQL
                                 :id session-id
                                 :user_id user-id
                                 :auth_identity_id auth-identity-id
                                 :session_key session-key
                                 :expires_at expires-at))
