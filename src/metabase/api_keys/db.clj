(ns metabase.api-keys.db
  "Application database queries for `:model/ApiKey`. Every function here is a direct Toucan 2 call with no additional
  logic, so no other namespace runs an ApiKey query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the api-keys-only section at the bottom of
  this namespace."
  (:require
   [malli.util :as mut]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.db :as users.db]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::api-key-filters
  "Which ApiKeys a query applies to. Keys mirror the columns of `api_key`: a scalar matches that value and a set
  matches any of its values. A nullable column also takes a `<column>_set` key, matching the rows where that column
  is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:id         {:optional true} [:or ::api-keys.schema/id [:set ::api-keys.schema/id]]]
   [:key_prefix {:optional true} :string]
   [:name       {:optional true} :string]
   [:scope_set  {:optional true} :boolean]])

(mr/def ::api-key-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::api-key-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::api-keys.schema/api-key.column]]
    [:order-by {:optional true} [:sequential ::api-keys.schema/api-key.column]]]])

(def ^:private set-columns
  "Maps each `<column>_set` filter key of [[::api-key-filters]] to the column whose nullness it tests."
  {:scope_set :scope})

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/ApiKey columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts {:set-columns set-columns}))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns set-columns}))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-api-keys :- [:sequential ::api-keys.schema/api-key.partial]
  "The ApiKeys matching `opts`."
  ([]
   (select-api-keys nil))
  ([{:keys [columns] :as opts} :- [:maybe ::api-key-opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-api-key :- [:maybe ::api-keys.schema/api-key.partial]
  "The first ApiKey matching `opts`, or nil."
  ([]
   (select-one-api-key nil))
  ([{:keys [columns] :as opts} :- [:maybe ::api-key-opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn count-api-keys :- :int
  "The number of ApiKeys matching `opts`."
  ([]
   (count-api-keys nil))
  ([opts :- [:maybe ::api-key-opts]]
   (apply t2/count :model/ApiKey (->args opts))))

(mu/defn api-key-exists? :- :boolean
  "Whether an ApiKey matching `opts` exists."
  [opts :- [:maybe ::api-key-opts]]
  (apply t2/exists? :model/ApiKey (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-api-key! :- ::api-keys.schema/api-key
  "Insert the ApiKey `row` and return the inserted instance."
  [row :- ::api-keys.schema/api-key.create]
  (t2/insert-returning-instance! :model/ApiKey row))

(mu/defn update-api-keys! :- :int
  "Apply `changes` to every ApiKey matching `opts`, returning the number updated."
  [opts    :- [:maybe ::api-key-opts]
   changes :- ::api-keys.schema/api-key.update]
  (apply t2/update! :model/ApiKey (conj (->kv-args opts) changes)))

(mu/defn delete-api-keys! :- :int
  "Delete every ApiKey matching `opts`, returning the number deleted."
  [opts :- [:maybe ::api-key-opts]]
  (apply t2/delete! :model/ApiKey (->kv-args opts)))

;;; --------------------------------- Queries used only by the api-keys module ---------------------------------

(def ^:private ApiKeyWithGroupId
  "An ApiKey instance possibly carrying the `::api-keys/group-id` the before-update hook consumes."
  (mut/merge ::api-keys.schema/api-key
             [:map
              [:metabase.api-keys.core/group-id {:optional true} [:maybe ms/PositiveInt]]]))

(mu/defn save-api-key!
  "Save the changes made to the ApiKey instance `api-key` and return it."
  [api-key :- ApiKeyWithGroupId]
  (t2/save! api-key))

(mu/defn select-api-key-groups
  "The group name, group id, and api key id of the PermissionsGroups of the ApiKeys with `api-key-ids`."
  [api-key-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select [[:pg.name :group-name]
                      [:pg.id :group-id]
                      [:api_key.id :api-key-id]]
             :from   [[:permissions_group :pg]]
             :join   [[:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]
                      :api_key [:= :api_key.user_id :pgm.user_id]]
             :where  [:in :api_key.id api-key-ids]}))

(mu/defn rename-api-key-user!
  "Set the first name (and clear the last name) of the api-key User with `user-id`."
  [user-id    :- ::lib.schema.id/user
   first-name :- :string]
  (users.db/update-users! {:id user-id :type :api-key} {:first_name first-name :last_name ""}))

(mu/defn user-type
  "The `:type` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (:type (users.db/select-one-user {:id user-id :columns [:type]})))

(mu/defn deactivate-api-key-user!
  "Deactivate the api-key User with `user-id` (nil for keys without a user, e.g. SCIM keys, which updates nothing)."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (when user-id
    (users.db/update-users! {:id user-id :type :api-key} {:is_active false})))

(mu/defn insert-user!
  "Insert the User `row` and return its id."
  [row :- ::users.schema/user.create]
  (:id (users.db/insert-user! row)))
