(ns metabase.setup-rest.queries
  "Application database queries for the setup REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn insert-superuser!
  "Insert a superuser with the given email and name and return the User instance."
  [email first-name last-name]
  (t2/insert-returning-instance! :model/User
                                 :email        email
                                 :first_name   first-name
                                 :last_name    last-name
                                 :is_superuser true))

(defn user
  "The User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/User :id user-id))
