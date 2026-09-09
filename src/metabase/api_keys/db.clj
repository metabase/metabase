(ns metabase.api-keys.db
  "Application database queries for the API keys module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn unscoped-api-key-count :- ms/IntGreaterThanOrEqualToZero
  "The number of ApiKeys without a scope."
  []
  (t2/count :model/ApiKey :scope nil))

(mu/defn unscoped-api-keys :- [:sequential ::api-keys.schema/api-key]
  "The ApiKeys without a scope."
  []
  (t2/select :model/ApiKey :scope nil))

(mu/defn api-key :- [:maybe ::api-keys.schema/api-key]
  "The ApiKey with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/ApiKey id))

(mu/defn save-api-key! :- ms/PositiveInt
  "Save the changes made to the ApiKey instance `api-key`."
  [api-key :- ::api-keys.schema/api-key]
  (t2/save! api-key))

(mu/defn api-key-exists? :- :boolean
  "Whether an ApiKey with `id` exists."
  [id :- ms/PositiveInt]
  (t2/exists? :model/ApiKey id))

(mu/defn delete-api-key! :- :int
  "Delete the ApiKey with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/ApiKey id))

(def ^:private ApiKeyGroup
  "Rows returned by [[api-key-groups]]."
  [:map {:closed true}
   [:group-name [:maybe :string]]
   [:group-id ms/PositiveInt]
   [:api-key-id ms/PositiveInt]])

(mu/defn api-key-groups :- [:sequential
                            ApiKeyGroup]
  "The group name, group id, and api key id of the PermissionsGroups of the ApiKeys with `api-key-ids`."
  [api-key-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select [[:pg.name :group-name]
                      [:pg.id :group-id]
                      [:api_key.id :api-key-id]]
             :from   [[:permissions_group :pg]]
             :join   [[:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]
                      :api_key [:= :api_key.user_id :pgm.user_id]]
             :where  [:in :api_key.id api-key-ids]}))

(mu/defn rename-api-key-user! :- :int
  "Set the first name (and clear the last name) of the api-key User with `user-id`."
  [user-id    :- ::lib.schema.id/user
   first-name :- :string]
  (t2/update! :model/User :id user-id, :type :api-key, {:first_name first-name, :last_name ""}))

(mu/defn user-type :- [:maybe :keyword]
  "The `:type` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :type :model/User :id user-id))

(mu/defn deactivate-api-key-user! :- :int
  "Deactivate the api-key User with `user-id` (nil for keys without a user, e.g. SCIM keys, which updates nothing)."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/update! :model/User user-id, :type :api-key, {:is_active false}))

(mu/defn api-key-prefix-exists? :- :boolean
  "Whether an ApiKey with `prefix` exists."
  [prefix :- :string]
  (t2/exists? :model/ApiKey :key_prefix prefix))

(mu/defn api-key-name-exists? :- :boolean
  "Whether an ApiKey named `key-name` exists."
  [key-name :- :string]
  (t2/exists? :model/ApiKey :name key-name))

(mu/defn insert-user! :- ::lib.schema.id/user
  "Insert the User `row` and return its id."
  [row :- ::users.schema/user.update]
  (t2/insert-returning-pk! :model/User row))

(mu/defn insert-api-key! :- ::api-keys.schema/api-key
  "Insert the ApiKey `row` and return the inserted instance."
  [row :- ::api-keys.schema/api-key.create]
  (t2/insert-returning-instance! :model/ApiKey row))

(mu/defn update-api-key! :- :int
  "Apply `changes` to the ApiKey with `id`."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::api-keys.schema/api-key.update [:key :key_prefix :updated_by_id])]
  (t2/update! :model/ApiKey :id id changes))
