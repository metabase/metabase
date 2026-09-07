(ns metabase.api-keys.db
  "Application database queries for the API keys module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn unscoped-api-key-count
  "The number of ApiKeys without a scope."
  []
  (t2/count :model/ApiKey :scope nil))

(defn unscoped-api-keys
  "The ApiKeys without a scope."
  []
  (t2/select :model/ApiKey :scope nil))

(defn api-key
  "The ApiKey with `id`, or nil."
  [id]
  (t2/select-one :model/ApiKey id))

(defn save-api-key!
  "Save the changes made to the ApiKey instance `api-key`."
  [api-key]
  (t2/save! api-key))

(defn api-key-exists?
  "Whether an ApiKey with `id` exists."
  [id]
  (t2/exists? :model/ApiKey id))

(defn delete-api-key!
  "Delete the ApiKey with `id`."
  [id]
  (t2/delete! :model/ApiKey id))

(defn api-key-groups
  "The group name, group id, and api key id of the PermissionsGroups of the ApiKeys with `api-key-ids`."
  [api-key-ids]
  (t2/query {:select [[:pg.name :group-name]
                      [:pg.id :group-id]
                      [:api_key.id :api-key-id]]
             :from   [[:permissions_group :pg]]
             :join   [[:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]
                      :api_key [:= :api_key.user_id :pgm.user_id]]
             :where  [:in :api_key.id api-key-ids]}))

(defn rename-api-key-user!
  "Set the first name (and clear the last name) of the api-key User with `user-id`."
  [user-id first-name]
  (t2/update! :model/User :id user-id, :type :api-key, {:first_name first-name, :last_name ""}))

(defn user-type
  "The `:type` of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one-fn :type :model/User :id user-id))

(defn deactivate-api-key-user!
  "Deactivate the api-key User with `user-id`."
  [user-id]
  (t2/update! :model/User user-id, :type :api-key, {:is_active false}))

(defn api-key-prefix-exists?
  "Whether an ApiKey with `prefix` exists."
  [prefix]
  (t2/exists? :model/ApiKey :key_prefix prefix))

(defn api-key-name-exists?
  "Whether an ApiKey named `key-name` exists."
  [key-name]
  (t2/exists? :model/ApiKey :name key-name))

(defn insert-user!
  "Insert the User `row` and return its id."
  [row]
  (t2/insert-returning-pk! :model/User row))

(defn insert-api-key!
  "Insert the ApiKey `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/ApiKey row))

(defn update-api-key!
  "Apply `changes` to the ApiKey with `id`."
  [id changes]
  (t2/update! :model/ApiKey :id id changes))
