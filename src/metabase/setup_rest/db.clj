(ns metabase.setup-rest.db
  "Application database queries for the setup REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.db :as users.db]
   [metabase.util.malli :as mu]))

(mu/defn insert-superuser!
  "Insert a superuser with the given email and name and return the User instance."
  [email :- :string
   first-name :- [:maybe :string]
   last-name :- [:maybe :string]]
  (users.db/insert-user! {:email email :first_name first-name :last_name last-name :is_superuser true}))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (users.db/select-one-user {:id user-id}))
