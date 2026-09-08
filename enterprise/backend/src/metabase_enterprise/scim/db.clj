(ns metabase-enterprise.scim.db
  "Application database queries for the scim module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions."
  (:require
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

(def ^:private UserRow
  "The writable columns of a User row."
  [:map {:closed true}
   [:email                    {:optional true} :any]
   [:first_name               {:optional true} :any]
   [:last_name                {:optional true} :any]
   [:password                 {:optional true} :any]
   [:password_salt            {:optional true} :any]
   [:date_joined              {:optional true} :any]
   [:last_login               {:optional true} :any]
   [:is_superuser             {:optional true} :any]
   [:is_active                {:optional true} :any]
   [:reset_token              {:optional true} :any]
   [:reset_triggered          {:optional true} :any]
   [:is_qbnewb                {:optional true} :any]
   [:login_attributes         {:optional true} :any]
   [:updated_at               {:optional true} :any]
   [:sso_source               {:optional true} :any]
   [:locale                   {:optional true} :any]
   [:is_datasetnewb           {:optional true} :any]
   [:settings                 {:optional true} :any]
   [:type                     {:optional true} :any]
   [:entity_id                {:optional true} :any]
   [:deactivated_at           {:optional true} :any]
   [:tenant_id                {:optional true} :any]
   [:jwt_attributes           {:optional true} :any]
   [:deactivated_with_tenant  {:optional true} :any]
   [:is_data_analyst          {:optional true} :any]])

(def ^:private ApiKeyRow
  "The writable columns of an ApiKey row."
  [:map {:closed true}
   [:user_id                            {:optional true} :any]
   [:key                                {:optional true} :any]
   [:key_prefix                         {:optional true} :any]
   [:creator_id                         {:optional true} :any]
   [:created_at                         {:optional true} :any]
   [:updated_at                         {:optional true} :any]
   [:name                               {:optional true} :any]
   [:updated_by_id                      {:optional true} :any]
   [:scope                              {:optional true} :any]
   [:metabase.api-keys.core/unhashed-key {:optional true} :any]])

(mu/defn scim-api-key :- [:maybe (ms/InstanceOf :model/ApiKey)]
  "The SCIM ApiKey, or nil."
  []
  (t2/select-one :model/ApiKey :scope :scim))

(mu/defn delete-scim-api-keys! :- :int
  "Delete every SCIM ApiKey, returning the number deleted."
  []
  (t2/delete! :model/ApiKey :scope :scim))

(mu/defn insert-api-key! :- (ms/InstanceOf :model/ApiKey)
  "Insert `api-key` and return the new instance."
  [api-key :- ApiKeyRow]
  (t2/insert-returning-instance! :model/ApiKey api-key))

(defn- personal-user-expr
  [email]
  [:and [:= :type "personal"]
   (when email [:= :%lower.email (u/lower-case-en email)])])

(mu/defn scim-user-by-entity-id :- [:maybe (ms/InstanceOf :model/User)]
  "The SCIM columns of the personal User with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one user-columns :entity_id entity-id {:where [:= :type "personal"]}))

(mu/defn scim-user-by-email :- [:maybe (ms/InstanceOf :model/User)]
  "The SCIM columns of the User with `email`, or nil."
  [email :- :string]
  (t2/select-one user-columns :email (u/lower-case-en email)))

(mu/defn scim-users :- [:sequential (ms/InstanceOf :model/User)]
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

(mu/defn scim-user-count :- ms/IntGreaterThanOrEqualToZero
  "The number of personal Users, narrowed to the optional `email` (case-insensitive)."
  [email :- [:maybe :string]]
  (t2/count :model/User {:where (personal-user-expr email)}))

(mu/defn user-email-exists? :- :boolean
  "Whether a User with `email` (case-insensitive) exists."
  [email :- :string]
  (t2/exists? :model/User :%lower.email (u/lower-case-en email)))

(mu/defn user-ids-by-entity-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Users with `entity-ids`."
  [entity-ids :- [:seqable :string]]
  (t2/select-fn-set :id :model/User {:where [:in :entity_id entity-ids]}))

(mu/defn insert-user! :- :int
  "Insert the User `row`, returning the number inserted."
  [row :- UserRow]
  (t2/insert! :model/User row))

(mu/defn update-user! :- :int
  "Apply `changes` to the User with `user-id`, returning the number updated."
  [user-id :- ms/PositiveInt
   changes :- UserRow]
  (t2/update! :model/User user-id changes))

(mu/defn user-group-memberships :- [:sequential [:map {:closed true}
                                                 [:user_id ms/PositiveInt]
                                                 [:name :string]
                                                 [:entity_id :string]]]
  "Rows of User ID, group name, and group entity ID for the memberships of the Users with `user-ids`, excluding the
  groups with `excluded-group-ids`."
  [user-ids           :- [:seqable ms/PositiveInt]
   excluded-group-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/PermissionsGroupMembership :pgm.user_id :pg.name :pg.entity_id]
             {:from  [[:permissions_group_membership :pgm]]
              :join  [[:permissions_group :pg] [:= :pg.id :group_id]]
              :where (into [:and [:in :user_id user-ids]]
                           (map (fn [group-id] [:not= :pg.id group-id]))
                           excluded-group-ids)}))

(defn- manageable-group-expr
  [excluded-group-ids group-name]
  (into [:and (when group-name [:= :name group-name])]
        (map (fn [group-id] [:not= :id group-id]))
        excluded-group-ids))

(mu/defn scim-group-by-entity-id :- [:maybe (ms/InstanceOf :model/PermissionsGroup)]
  "The SCIM columns of the PermissionsGroup with `entity-id` other than `excluded-group-ids`, or nil."
  [entity-id          :- :string
   excluded-group-ids :- [:seqable ms/PositiveInt]]
  (t2/select-one group-columns :entity_id entity-id {:where (manageable-group-expr excluded-group-ids nil)}))

(mu/defn scim-groups :- [:sequential (ms/InstanceOf :model/PermissionsGroup)]
  "The SCIM columns of the PermissionsGroups other than `excluded-group-ids`, narrowed to the optional `group-name`,
  paged by `limit` and `offset` in ID order."
  [excluded-group-ids :- [:seqable ms/PositiveInt]
   group-name         :- [:maybe :string]
   limit              :- [:maybe ms/PositiveInt]
   offset             :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select group-columns
             {:where    (manageable-group-expr excluded-group-ids group-name)
              :limit    limit
              :offset   offset
              :order-by [[:id :asc]]}))

(mu/defn scim-group-count :- ms/IntGreaterThanOrEqualToZero
  "The number of PermissionsGroups other than `excluded-group-ids`, narrowed to the optional `group-name`."
  [excluded-group-ids :- [:seqable ms/PositiveInt]
   group-name         :- [:maybe :string]]
  (t2/count :model/PermissionsGroup {:where (manageable-group-expr excluded-group-ids group-name)}))

(mu/defn group-name-exists? :- :boolean
  "Whether a PermissionsGroup with `group-name` (case-insensitive) exists."
  [group-name :- :string]
  (t2/exists? :model/PermissionsGroup :%lower.name (u/lower-case-en group-name)))

(mu/defn insert-group! :- (ms/InstanceOf :model/PermissionsGroup)
  "Insert `group` and return the new instance."
  [group :- [:map {:closed true}
             [:name             {:optional true} :any]
             [:entity_id        {:optional true} :any]
             [:magic_group_type {:optional true} :any]
             [:is_tenant_group  {:optional true} :any]]]
  (first (t2/insert-returning-instances! :model/PermissionsGroup group)))

(mu/defn update-group! :- :int
  "Apply `changes` to the PermissionsGroup with `group-id`, returning the number updated."
  [group-id :- ms/PositiveInt
   changes  :- [:map {:closed true}
                [:name             {:optional true} :any]
                [:entity_id        {:optional true} :any]
                [:magic_group_type {:optional true} :any]
                [:is_tenant_group  {:optional true} :any]]]
  (t2/update! :model/PermissionsGroup group-id changes))

(mu/defn delete-group! :- :int
  "Delete the PermissionsGroup with `group-id`, returning the number deleted."
  [group-id :- ms/PositiveInt]
  (t2/delete! :model/PermissionsGroup group-id))

(mu/defn group-members :- [:sequential [:map {:closed true}
                                        [:group_id ms/PositiveInt]
                                        [:email :string]
                                        [:entity_id :string]]]
  "Rows of group ID, member email, and member entity ID for the memberships of the PermissionsGroups with
  `group-ids`."
  [group-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/PermissionsGroupMembership :pgm.group_id :u.email :u.entity_id]
             {:from  [[:permissions_group_membership :pgm]]
              :join  [[:core_user :u] [:= :u.id :pgm.user_id]]
              :where [:in :pgm.group_id group-ids]}))
