(ns metabase.sso.db
  "Application database queries for the SSO module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn user-group-ids-excluding
  "The ids of the PermissionsGroups the User with `user-id` belongs to, other than `excluded-group-ids`."
  [user-id            :- ::lib.schema.id/user
   excluded-group-ids :- [:set ms/PositiveInt]]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership
                    {:where [:and
                             [:= :user_id user-id]
                             [:not-in :group_id excluded-group-ids]]}))

(mu/defn user-group-ids-among
  "The ids among `group-ids` of the PermissionsGroups the User with `user-id` belongs to, other than
  `excluded-group-ids`."
  [user-id            :- ::lib.schema.id/user
   group-ids          :- [:set ms/PositiveInt]
   excluded-group-ids :- [:set ms/PositiveInt]]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership
                    {:where [:and
                             [:= :user_id user-id]
                             [:in :group_id group-ids]
                             [:not-in :group_id excluded-group-ids]]}))

(mu/defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity for `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/exists? :model/AuthIdentity :user_id user-id :provider provider))

(mu/defn insert-auth-identity!
  "Insert an AuthIdentity linking the User with `user-id` to `provider-id` at `provider`."
  [user-id     :- ::lib.schema.id/user
   provider    :- :string
   provider-id :- :string]
  (t2/insert! :model/AuthIdentity {:user_id user-id, :provider provider, :provider_id provider-id}))

(mu/defn set-auth-identity-metadata!
  "Set the `metadata` of the AuthIdentity of the User with `user-id` at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string
   metadata :- [:maybe :map]]
  (t2/update! :model/AuthIdentity {:user_id user-id, :provider provider} {:metadata metadata}))
