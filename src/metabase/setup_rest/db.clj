(ns metabase.setup-rest.db
  "Application database queries for the setup REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn insert-superuser!
  "Insert a superuser with the given email and name and return the User instance."
  [email :- :string
   first-name :- [:maybe :string]
   last-name :- [:maybe :string]]
  (t2/insert-returning-instance! :model/User
                                 :email        email
                                 :first_name   first-name
                                 :last_name    last-name
                                 :is_superuser true))
