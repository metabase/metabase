(ns metabase.sso.db
  "Application database queries for the SSO module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.auth-identity.schema :as auth-identity.schema]
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

(mu/defn auth-identity
  "The AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/select-one :model/AuthIdentity :user_id [:auto/param (long user-id)] :provider [:auto/param provider]))

(mu/defn auth-identity-with-provider-id
  "The AuthIdentity of the User with `user-id` at `provider` whose `provider_id` is `provider-id`, or nil."
  [user-id     :- ::lib.schema.id/user
   provider    :- :string
   provider-id :- :string]
  (t2/select-one :model/AuthIdentity
                 :user_id     [:auto/param (long user-id)]
                 :provider    [:auto/param provider]
                 :provider_id [:auto/param provider-id]))

(mu/defn auth-identities-with-provider-id
  "The AuthIdentities at any of `providers` whose `provider_id` is `provider-id`."
  [providers   :- [:sequential :string]
   provider-id :- :string]
  (t2/select :model/AuthIdentity :provider [:in providers] :provider_id [:auto/param provider-id]))

(mu/defn slack-connect-identity
  "The user's Slack identity with `:provider_id` and `:metadata` selected, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/AuthIdentity :provider_id :metadata]
                 :user_id [:auto/param (long user-id)] :provider "slack-connect"))

(mu/defn delete-slack-connect-identity!
  "Delete the user's Slack identity, returning the number deleted."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/AuthIdentity :user_id [:auto/param (long user-id)] :provider "slack-connect"))

(mu/defn insert-auth-identity!
  "Insert an AuthIdentity linking the User with `user-id` to `provider-id` at `provider`, with `metadata`."
  [user-id     :- ::lib.schema.id/user
   provider    :- :string
   provider-id :- :string
   metadata    :- [:maybe ::auth-identity.schema/auth-identity.metadata]]
  (t2/insert! :model/AuthIdentity {:user_id user-id, :provider provider, :provider_id provider-id, :metadata metadata}))
