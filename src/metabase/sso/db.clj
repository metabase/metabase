(ns metabase.sso.db
  "Application database queries for the SSO module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn user-group-ids-excluding
  "The ids of the PermissionsGroups the User with `user-id` belongs to, other than `excluded-group-ids`."
  [user-id excluded-group-ids]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership
                    {:where [:and
                             [:= :user_id user-id]
                             [:not-in :group_id excluded-group-ids]]}))

(defn user-group-ids-among
  "The ids among `group-ids` of the PermissionsGroups the User with `user-id` belongs to, other than
  `excluded-group-ids`."
  [user-id group-ids excluded-group-ids]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership
                    {:where [:and
                             [:= :user_id user-id]
                             [:in :group_id group-ids]
                             [:not-in :group_id excluded-group-ids]]}))

(defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity for `provider`."
  [user-id provider]
  (t2/exists? :model/AuthIdentity :user_id user-id :provider provider))

(defn insert-auth-identity!
  "Insert an AuthIdentity linking the User with `user-id` to `provider-id` at `provider`."
  [user-id provider provider-id]
  (t2/insert! :model/AuthIdentity {:user_id user-id, :provider provider, :provider_id provider-id}))

(defn set-auth-identity-metadata!
  "Set the `metadata` of the AuthIdentity of the User with `user-id` at `provider`."
  [user-id provider metadata]
  (t2/update! :model/AuthIdentity {:user_id user-id, :provider provider} {:metadata metadata}))
