(ns metabase.sso.db
  "Application database queries for the SSO module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as mdb]
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
  (mdb/select-batched-set #(t2/select-fn-set :group_id :model/PermissionsGroupMembership
                                             {:where [:and
                                                      [:= :user_id user-id]
                                                      [:in :group_id %]
                                                      [:not-in :group_id excluded-group-ids]]})
                          group-ids))

(mu/defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity for `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/exists? :model/AuthIdentity :user_id user-id :provider provider))

(mu/defn used-password-exists?
  "Whether the User with `user-id` has a `password` AuthIdentity that has been used to log in."
  [user-id :- ::lib.schema.id/user]
  (t2/exists? :model/AuthIdentity
              :user_id      user-id
              :provider     "password"
              :last_used_at [:not= nil]))

(mu/defn slack-connect-identity
  "The user's Slack identity with `:provider_id` and `:metadata` selected, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/AuthIdentity :provider_id :metadata]
                 :user_id (long user-id) :provider "slack-connect"))

(mu/defn auth-identity-ids :- [:sequential ms/PositiveInt]
  "The ids of every AuthIdentity of the User with `user-id` at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (vec (t2/select-pks-vec :model/AuthIdentity :user_id user-id :provider provider)))

(mu/defn auth-identity-id
  "The id of the AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider provider))
