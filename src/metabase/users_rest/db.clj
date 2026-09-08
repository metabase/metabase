(ns metabase.users-rest.db
  "Application database queries for the users REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private UserChanges
  "The keys callers pass to [[update-user!]]."
  [:map {:closed true}
   [:first_name       {:optional true} :any]
   [:last_name        {:optional true} :any]
   [:locale           {:optional true} :any]
   [:login_attributes {:optional true} :any]
   [:tenant_id        {:optional true} :any]
   [:email            {:optional true} :any]
   [:is_superuser     {:optional true} :any]
   [:is_active        {:optional true} :any]
   [:sso_source       {:optional true} :any]])

(def ^:private PersonalUserChanges
  "The keys callers pass to [[update-personal-user!]]."
  [:map {:closed true}
   [:is_active      {:optional true} :boolean]
   [:is_qbnewb      {:optional true} :boolean]
   [:is_datasetnewb {:optional true} :boolean]])

(mu/defn rename-collection! :- :int
  "Set the name of the Collection with `collection-id`."
  [collection-id   :- ms/PositiveInt
   collection-name :- :string]
  (t2/update! :model/Collection collection-id {:name collection-name}))

(mu/defn users-with-columns :- [:sequential (ms/InstanceOf :model/User)]
  "The `columns` of the Users selected by the Honey SQL `query`."
  [columns :- [:sequential :keyword]
   query   :- :map]
  (t2/select (into [:model/User] columns) query))

(mu/defn user-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Users matching the Honey SQL `query`."
  [query :- :map]
  (t2/count :model/User query))

(mu/defn distinct-user-count :- [:sequential [:map {:closed true} [:count ms/IntGreaterThanOrEqualToZero]]]
  "The `:count` of distinct Users matching the Honey SQL `clauses`."
  [clauses :- :map]
  (t2/query (merge {:select [[[:count [:distinct :core_user.id]] :count]]
                    :from   :core_user}
                   clauses)))

(mu/defn user-sso-source :- :any
  "The SSO source of the User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one-fn :sso_source :model/User :id user-id))

(mu/defn has-visible-card? :- :boolean
  "Whether an unarchived, non-internal Card visible to the current user exists, optionally narrowed to `card-type`
  (nil for any type)."
  [card-type :- [:maybe :string]]
  (t2/exists? :model/Card
              {:where (into [:and
                             [:= :archived false]
                             (collection/visible-collection-filter-clause)
                             (mi/exclude-internal-content-hsql :model/Card)]
                            (when card-type [[:= :type card-type]]))}))

(mu/defn has-visible-dashboard? :- :boolean
  "Whether an unarchived, non-internal Dashboard visible to the current user exists."
  []
  (t2/exists? :model/Dashboard
              {:where [:and
                       [:= :archived false]
                       (collection/visible-collection-filter-clause)
                       (mi/exclude-internal-content-hsql :model/Dashboard)]}))

(mu/defn first-login :- [:maybe (ms/InstanceOf :model/LoginHistory)]
  "The timestamp of the earliest LoginHistory of the User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one [:model/LoginHistory :timestamp] :user_id user-id {:order-by [[:timestamp :asc]]}))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil. `dashboard-id` may be nil (e.g. when no custom homepage dashboard is
  configured) or a stale/invalid id (e.g. a deleted custom homepage Dashboard) that matches no Dashboard, in which
  case the result is nil."
  [dashboard-id :- [:maybe :int]]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn writable-collection-exists? :- :boolean
  "Whether the current user can write to at least one Collection (excluding the Trash and archived items)."
  []
  (t2/exists? :model/Collection
              {:where (collection/visible-collection-filter-clause
                       :id
                       {:include-trash-collection? false
                        :include-archived-items    :exclude
                        :permission-level          :write})}))

(mu/defn other-user-with-email-exists? :- :boolean
  "Whether a User other than `user-id` has an email matching `email` case-insensitively."
  [email   :- :string
   user-id :- ms/PositiveInt]
  (t2/exists? :model/User, :%lower.email (u/lower-case-en email), :id [:not= user-id]))

(mu/defn update-user! :- :int
  "Apply `changes` to the User with `user-id`."
  [user-id :- ms/PositiveInt
   changes :- UserChanges]
  (t2/update! :model/User user-id changes))

(mu/defn user :- [:maybe (ms/InstanceOf :model/User)]
  "The User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one :model/User :id user-id))

(mu/defn personal-user-columns :- [:maybe (ms/InstanceOf :model/User)]
  "The id, email, name, active flag, SSO source, and tenant id of the personal User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one [:model/User :id :email :first_name :last_name :is_active :sso_source :tenant_id]
                 :type :personal
                 :id user-id))

(mu/defn active-personal-user-login-columns :- [:maybe (ms/InstanceOf :model/User)]
  "The id, email, and last login of the active personal User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one [:model/User :id :email :last_login], :id user-id, :type :personal, :is_active true))

(mu/defn user-active-and-type :- [:maybe (ms/InstanceOf :model/User)]
  "The id, active flag, and type of the User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one [:model/User :id :is_active :type] :id user-id))

(mu/defn user-exists? :- :boolean
  "Whether a User with `user-id` exists."
  [user-id :- ms/PositiveInt]
  (t2/exists? :model/User :id user-id))

(mu/defn update-personal-user! :- :int
  "Apply `changes` to the personal User with `user-id`, returning the number of rows updated."
  [user-id :- ms/PositiveInt
   changes :- PersonalUserChanges]
  (t2/update! :model/User user-id {:type :personal} changes))
