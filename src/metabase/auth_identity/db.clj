(ns metabase.auth-identity.db
  "Application database queries for the auth identity module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private AuthIdentityRow
  "The writable columns of an AuthIdentity row (excluding `:id`, `:created_at`, `:updated_at`)."
  [:map {:closed true}
   [:user_id      {:optional true} [:maybe ::lib.schema.id/user]]
   [:provider     {:optional true} [:maybe [:or :keyword :string]]]
   [:credentials  {:optional true} [:maybe :map]]
   [:metadata     {:optional true} [:maybe :map]]
   [:provider_id  {:optional true} [:maybe :string]]
   [:last_used_at {:optional true} [:maybe ms/TemporalInstant]]
   [:expires_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:confirmed_at {:optional true} [:maybe ms/TemporalInstant]]])

(mu/defn auth-identity
  "The AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider provider))

(mu/defn auth-identity-id
  "The id of the AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider provider))

(mu/defn auth-identity-expiry
  "The id and expiry of the AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/select-one [:model/AuthIdentity :id :expires_at] :user_id user-id :provider provider))

(mu/defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/exists? :model/AuthIdentity :user_id user-id :provider provider))

(mu/defn insert-auth-identity!
  "Insert the AuthIdentity `row`, returning the number inserted."
  [row :- AuthIdentityRow]
  (t2/insert! :model/AuthIdentity row))

(mu/defn update-auth-identity!
  "Apply `changes` to the AuthIdentity with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- AuthIdentityRow]
  (t2/update! :model/AuthIdentity id changes))

(mu/defn touch-auth-identity!
  "Set `last_used_at` of the AuthIdentity with `id` to now, returning the number updated. `id` may be nil (no
  matching AuthIdentity), which updates nothing."
  [id :- [:maybe ms/PositiveInt]]
  (t2/update! :model/AuthIdentity id {:last_used_at :%now}))

(mu/defn delete-auth-identities!
  "Delete the AuthIdentities of the User with `user-id` at `provider`, returning the number deleted."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/delete! :model/AuthIdentity :user_id user-id :provider provider))

(mu/defn delete-sessions-for-user!
  "Delete every Session of the User with `user-id`, returning the number deleted. Duplicates
  `metabase.session.db/delete-sessions-for-user!`; can't delegate to it because the `session` module already depends
  on `auth-identity`, so the reverse dependency would be a module cycle."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/Session :user_id user-id))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User user-id))

(mu/defn user-by-email
  "The User whose email matches `email` case-insensitively, or nil."
  [email :- :string]
  (t2/select-one :model/User :%lower.email (u/lower-case-en email)))

(mu/defn user-login-columns
  "The id, active flag, last login, and tenant id of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id))

(mu/defn user-login-columns-by-email
  "The id, active flag, last login, and tenant id of the User whose email matches `email` case-insensitively, or
  nil."
  [email :- :string]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :%lower.email (u/lower-case-en email)))

(mu/defn user-login-status
  "The id, active flag, and last login of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :is_active :last_login] user-id))

(mu/defn user-active?
  "Whether the User with `user-id` is active."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_active :model/User :id user-id))

(mu/defn update-user!
  "Apply `changes` to the User with `user-id`, returning the number updated."
  [user-id :- ::lib.schema.id/user
   changes :- ::users.schema/user.update]
  (t2/update! :model/User user-id changes))

(mu/defn insert-user-returning-login-columns!
  "Insert the User `row` and return its id, last login, active flag, and tenant id."
  [row :- ::users.schema/user.update]
  (t2/insert-returning-instance! [:model/User :id :last_login :is_active :tenant_id] row))

(mu/defn insert-session!
  "Insert a Session and return the inserted instance."
  [session-id           :- :string
   user-id              :- ::lib.schema.id/user
   auth-identity-id     :- [:maybe ms/PositiveInt]
   session-key          :- :string
   expires-at           :- [:maybe ms/TemporalInstant]
   mfa-auth-identity-id :- [:maybe ms/PositiveInt]]
  (t2/insert-returning-instance! :model/Session
                                 ;; Without setting the ID here we can't return an instance on MySQL
                                 :id session-id
                                 :user_id user-id
                                 :auth_identity_id auth-identity-id
                                 :session_key session-key
                                 :expires_at expires-at
                                 :mfa_auth_identity_id mfa-auth-identity-id))
