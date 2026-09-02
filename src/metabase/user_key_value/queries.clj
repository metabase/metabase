(ns metabase.user-key-value.queries
  "Application database queries for the user key-value module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn user-key-value
  "The UserKeyValue of the User with `user-id` for `k` in `namespace`, or nil."
  [user-id namespace k]
  (t2/select-one :model/UserKeyValue :user_id user-id :namespace namespace :key k))

(defn update-user-key-value!
  "Set the value and expiry of the UserKeyValue of the User with `user-id` for `k` in `namespace`."
  [user-id namespace k value expires-at]
  (t2/update! :model/UserKeyValue :user_id user-id :namespace namespace :key k {:value value, :expires_at expires-at}))

(defn insert-user-key-value!
  "Insert a UserKeyValue for the User with `user-id`."
  [user-id namespace k value expires-at]
  (t2/insert! :model/UserKeyValue {:user_id    user-id
                                   :namespace  namespace
                                   :key        k
                                   :value      value
                                   :expires_at expires-at}))

(defn delete-user-key-value!
  "Delete the UserKeyValue of the User with `user-id` for `k` in `namespace`."
  [user-id namespace k]
  (t2/delete! :model/UserKeyValue :namespace namespace :user_id user-id :key k))

(defn unexpired-user-key-value
  "The unexpired UserKeyValue of the User with `user-id` for `k` in `namespace`, or nil."
  [user-id namespace k]
  (t2/select-one :model/UserKeyValue
                 {:where [:and
                          [:= :user_id user-id]
                          [:= :namespace namespace]
                          [:= :key k]
                          [:or
                           [:>= :expires_at :%now]
                           [:= :expires_at nil]]]}))

(defn unexpired-user-key-values
  "The unexpired UserKeyValues of the User with `user-id` in `namespace`."
  [user-id namespace]
  (t2/select :model/UserKeyValue
             {:where [:and
                      [:= :user_id user-id]
                      [:= :namespace namespace]
                      [:or
                       [:>= :expires_at :%now]
                       [:= :expires_at nil]]]}))
