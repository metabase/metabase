(ns metabase.setup-rest.db
  "Application database queries for the setup REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-superuser! :- (ms/InstanceOf :model/User)
  "Insert a superuser with the given email and name and return the User instance."
  [email :- :string
   first-name :- [:maybe :string]
   last-name :- [:maybe :string]]
  (t2/insert-returning-instance! :model/User
                                 :email        email
                                 :first_name   first-name
                                 :last_name    last-name
                                 :is_superuser true))

(mu/defn user :- [:maybe (ms/InstanceOf :model/User)]
  "The User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one :model/User :id user-id))
