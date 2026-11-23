(ns metabase.auth-identity.db
  "Application database queries for the auth identity module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn auth-identity
  "The AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/select-one :model/AuthIdentity :user_id (long user-id) :provider [:auto/param provider]))

(mu/defn auth-identity-id
  "The id of the AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/select-one-pk :model/AuthIdentity :user_id (long user-id) :provider [:auto/param provider]))

(mu/defn auth-identity-expiry
  "The id and expiry of the AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/select-one [:model/AuthIdentity :id :expires_at] :user_id (long user-id) :provider [:auto/param provider]))

(mu/defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/exists? :model/AuthIdentity :user_id (long user-id) :provider [:auto/param provider]))

(mu/defn user-ids-with-used-password :- [:set ::lib.schema.id/user]
  "The ids among `user-ids` of the Users whose `password` AuthIdentity has been used to log in."
  [user-ids :- [:set ::lib.schema.id/user]]
  (set (when (seq user-ids)
         (t2/select-fn-set :user_id [:model/AuthIdentity :user_id]
                           :user_id      [:in [:auto/param user-ids]]
                           :provider     "password"
                           :last_used_at [:not= nil]))))

(mu/defn insert-auth-identity!
  "Insert the AuthIdentity `row`, returning the number inserted."
  [row :- ::auth-identity.schema/auth-identity.create]
  (t2/insert! :model/AuthIdentity row))

(mu/defn select-or-insert-auth-identity! :- ::auth-identity.schema/auth-identity
  "The AuthIdentity of the User with `user-id` at `provider`, inserting one with no credentials when there is none."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (mdb/select-or-insert! :model/AuthIdentity {:user_id user-id :provider provider} (constantly {})))

(mu/defn update-auth-identities!
  "Apply `changes` to the AuthIdentities with `ids`, which must not be empty, returning the number updated."
  [ids     :- [:sequential {:min 1} ms/PositiveInt]
   changes :- ::auth-identity.schema/auth-identity.update]
  (t2/update! :model/AuthIdentity :id [:in [:auto/param (vec ids)]] changes))

(mu/defn touch-auth-identity!
  "Set `last_used_at` of the AuthIdentity with `id` to now, returning the number updated. `id` may be nil (no
  matching AuthIdentity), which updates nothing."
  [id :- [:maybe ms/PositiveInt]]
  (t2/update! :model/AuthIdentity :id [:auto/param id] {:last_used_at :%now}))

(mu/defn auth-identity-ids :- [:sequential ms/PositiveInt]
  "The ids of every AuthIdentity of the User with `user-id` at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (vec (t2/select-pks-vec :model/AuthIdentity :user_id (long user-id) :provider [:auto/param provider])))

(mu/defn delete-auth-identities!
  "Delete the AuthIdentities with `ids`, returning the number deleted."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/delete! :model/AuthIdentity :id [:in [:auto/param (vec ids)]]))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User :id [:auto/param user-id]))

(mu/defn user-by-email
  "The User whose email matches `email` case-insensitively, or nil."
  [email :- :string]
  (t2/select-one :model/User :%lower.email (u/lower-case-en email)))

(mu/defn user-login-columns
  "Return login details for the user with `user-id`, or nil.

  The details include the user's ID, active flag, last login, tenant ID, and type."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id :type] :id (long user-id)))

(mu/defn user-login-columns-by-email
  "Return login details for the user whose email matches `email`, or nil.

  The match is case-insensitive. The details include the user's ID, active flag, last login, tenant ID, and type."
  [email :- :string]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id :type] :%lower.email (u/lower-case-en email)))

(mu/defn user-login-status
  "The id, active flag, and last login of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :is_active :last_login] :id [:auto/param user-id]))

(mu/defn user-active?
  "Whether the User with `user-id` is active."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_active :model/User :id (long user-id)))
