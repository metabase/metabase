(ns metabase-enterprise.billing.db
  "Application database queries for the billing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn active-personal-user-count
  "The number of active personal Users."
  []
  (t2/count :model/User :is_active true :type :personal))

(defn user-email
  "The email of the User with `user-id`."
  [user-id]
  (t2/select-one-fn :email :model/User :id user-id))
