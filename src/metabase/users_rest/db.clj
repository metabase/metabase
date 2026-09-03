(ns metabase.users-rest.db
  "Application database queries for the users REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn rename-collection!
  "Set the name of the Collection with `collection-id`."
  [collection-id collection-name]
  (t2/update! :model/Collection collection-id {:name collection-name}))

(defn users-with-columns
  "The `columns` of the Users selected by the Honey SQL `query`."
  [columns query]
  (t2/select (into [:model/User] columns) query))

(defn user-count
  "The number of Users matching the Honey SQL `query`."
  [query]
  (t2/count :model/User query))

(defn distinct-user-count
  "The `:count` of distinct Users matching the Honey SQL `clauses`."
  [clauses]
  (t2/query (merge {:select [[[:count [:distinct :core_user.id]] :count]]
                    :from   :core_user}
                   clauses)))

(defn user-sso-source
  "The SSO source of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one-fn :sso_source :model/User :id user-id))

(defn entity-exists-where?
  "Whether a `model` row matching the Honey SQL `where` clause exists."
  [model where]
  (t2/exists? model {:where where}))

(defn first-login
  "The timestamp of the earliest LoginHistory of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/LoginHistory :timestamp] :user_id user-id {:order-by [[:timestamp :asc]]}))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn collection-exists-where?
  "Whether a Collection matching the Honey SQL `where` clause exists."
  [where]
  (t2/exists? :model/Collection {:where where}))

(defn other-user-with-email-exists?
  "Whether a User other than `user-id` has the lower-cased email `lower-case-email`."
  [lower-case-email user-id]
  (t2/exists? :model/User, :%lower.email lower-case-email, :id [:not= user-id]))

(defn update-user!
  "Apply `changes` to the User with `user-id`."
  [user-id changes]
  (t2/update! :model/User user-id changes))

(defn user
  "The User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/User :id user-id))

(defn personal-user-columns
  "The id, email, name, active flag, SSO source, and tenant id of the personal User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :id :email :first_name :last_name :is_active :sso_source :tenant_id]
                 :type :personal
                 :id user-id))

(defn active-personal-user-login-columns
  "The id, email, and last login of the active personal User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :id :email :last_login], :id user-id, :type :personal, :is_active true))

(defn user-active-and-type
  "The id, active flag, and type of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :id :is_active :type] :id user-id))

(defn user-exists?
  "Whether a User with `user-id` exists."
  [user-id]
  (t2/exists? :model/User :id user-id))

(defn update-personal-user!
  "Apply `changes` to the personal User with `user-id`, returning the number of rows updated."
  [user-id changes]
  (t2/update! :model/User user-id {:type :personal} changes))
