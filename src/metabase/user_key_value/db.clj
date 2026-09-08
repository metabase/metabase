(ns metabase.user-key-value.db
  "Application database queries for the user key-value module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn user-key-value :- [:maybe (ms/InstanceOf :model/UserKeyValue)]
  "The UserKeyValue of the User with `user-id` for `k` in `namespace`, or nil."
  [user-id   :- ms/PositiveInt
   namespace :- :string
   k         :- :string]
  (t2/select-one :model/UserKeyValue :user_id user-id :namespace namespace :key k))

(mu/defn update-user-key-value! :- :int
  "Set the value and expiry of the UserKeyValue of the User with `user-id` for `k` in `namespace`, returning the
  number updated."
  [user-id    :- ms/PositiveInt
   namespace  :- :string
   k          :- :string
   value      :- :string
   expires-at :- [:maybe ms/TemporalInstant]]
  (t2/update! :model/UserKeyValue :user_id user-id :namespace namespace :key k {:value value, :expires_at expires-at}))

(mu/defn insert-user-key-value! :- :int
  "Insert a UserKeyValue for the User with `user-id`, returning the number inserted."
  [user-id    :- ms/PositiveInt
   namespace  :- :string
   k          :- :string
   value      :- :string
   expires-at :- [:maybe ms/TemporalInstant]]
  (t2/insert! :model/UserKeyValue {:user_id    user-id
                                   :namespace  namespace
                                   :key        k
                                   :value      value
                                   :expires_at expires-at}))

(mu/defn delete-user-key-value! :- :int
  "Delete the UserKeyValue of the User with `user-id` for `k` in `namespace`, returning the number deleted."
  [user-id   :- ms/PositiveInt
   namespace :- :string
   k         :- :string]
  (t2/delete! :model/UserKeyValue :namespace namespace :user_id user-id :key k))

(mu/defn unexpired-user-key-value :- [:maybe (ms/InstanceOf :model/UserKeyValue)]
  "The unexpired UserKeyValue of the User with `user-id` for `k` in `namespace`, or nil."
  [user-id   :- ms/PositiveInt
   namespace :- :string
   k         :- :string]
  (t2/select-one :model/UserKeyValue
                 {:where [:and
                          [:= :user_id user-id]
                          [:= :namespace namespace]
                          [:= :key k]
                          [:or
                           [:>= :expires_at :%now]
                           [:= :expires_at nil]]]}))

(mu/defn unexpired-user-key-values :- [:sequential (ms/InstanceOf :model/UserKeyValue)]
  "The unexpired UserKeyValues of the User with `user-id` in `namespace`."
  [user-id   :- ms/PositiveInt
   namespace :- :string]
  (t2/select :model/UserKeyValue
             {:where [:and
                      [:= :user_id user-id]
                      [:= :namespace namespace]
                      [:or
                       [:>= :expires_at :%now]
                       [:= :expires_at nil]]]}))
