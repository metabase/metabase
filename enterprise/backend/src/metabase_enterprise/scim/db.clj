(ns metabase-enterprise.scim.db
  "Application database queries for the scim module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions."
  (:require
   [malli.util :as mut]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private user-columns
  "Required columns when fetching users for SCIM."
  [:model/User :id :first_name :last_name :email :locale :is_active :entity_id])

(def ^:private group-columns
  "Required columns when fetching groups for SCIM."
  [:model/PermissionsGroup :id :name :entity_id])

(mu/defn delete-scim-api-keys!
  "Delete every SCIM ApiKey, returning the number deleted."
  []
  (t2/delete! :model/ApiKey :scope :scim))

(mu/defn insert-api-key!
  "Insert `api-key` and return the new instance."
  [api-key :- ::api-keys.schema/api-key.create]
  (t2/insert-returning-instance! :model/ApiKey api-key))

(defn- personal-user-expr
  [email]
  [:and [:= :type "personal"]
   (when email [:= :%lower.email (u/lower-case-en email)])])

(mu/defn scim-user-by-entity-id
  "The SCIM columns of the personal User with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one user-columns :entity_id entity-id {:where [:= :type "personal"]}))

(mu/defn scim-user-by-email
  "The SCIM columns of the User with `email`, or nil."
  [email :- :string]
  (t2/select-one user-columns :email (u/lower-case-en email)))

(mu/defn scim-users
  "The SCIM columns of the personal Users, narrowed to the optional `email` (case-insensitive), paged by `limit`
  and `offset` in ID order."
  [email  :- [:maybe :string]
   limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select user-columns
             {:where    (personal-user-expr email)
              :limit    limit
              :offset   offset
              :order-by [[:id :asc]]}))

(mu/defn insert-user!
  "Insert the User `row`, returning the number inserted."
  [row :- ::users.schema/user.update]
  (t2/insert! :model/User row))

(mu/defn update-user!
  "Apply `changes` to the User with `user-id`, returning the number updated."
  [user-id :- ::lib.schema.id/user
   changes :- ::users.schema/user.update]
  (t2/update! :model/User user-id changes))

(defn- manageable-group-expr
  [excluded-group-ids group-name]
  (into [:and (when group-name [:= :name group-name])]
        (map (fn [group-id] [:not= :id group-id]))
        excluded-group-ids))

(mu/defn scim-group-by-entity-id
  "The SCIM columns of the PermissionsGroup with `entity-id` other than `excluded-group-ids`, or nil."
  [entity-id          :- :string
   excluded-group-ids :- [:sequential ms/PositiveInt]]
  (t2/select-one group-columns :entity_id entity-id {:where (manageable-group-expr excluded-group-ids nil)}))

(mu/defn scim-groups
  "The SCIM columns of the PermissionsGroups other than `excluded-group-ids`, narrowed to the optional `group-name`,
  paged by `limit` and `offset` in ID order."
  [excluded-group-ids :- [:sequential ms/PositiveInt]
   group-name         :- [:maybe :string]
   limit              :- [:maybe ms/PositiveInt]
   offset             :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select group-columns
             {:where    (manageable-group-expr excluded-group-ids group-name)
              :limit    limit
              :offset   offset
              :order-by [[:id :asc]]}))

(mu/defn insert-group!
  "Insert `group` and return the new instance."
  [group :- (mut/select-keys ::permissions.schema/permissions-group.update [:name :entity_id :magic_group_type :is_tenant_group])]
  (first (t2/insert-returning-instances! :model/PermissionsGroup group)))

(mu/defn update-group!
  "Apply `changes` to the PermissionsGroup with `group-id`, returning the number updated."
  [group-id :- ms/PositiveInt
   changes  :- (mut/select-keys ::permissions.schema/permissions-group.update [:name :entity_id :magic_group_type :is_tenant_group])]
  (t2/update! :model/PermissionsGroup group-id changes))

(mu/defn delete-group!
  "Delete the PermissionsGroup with `group-id`, returning the number deleted."
  [group-id :- ms/PositiveInt]
  (t2/delete! :model/PermissionsGroup group-id))
