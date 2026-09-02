(ns metabase.setup.queries
  "Application database queries for the setup module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn users-except
  "Every User other than the one with `user-id`."
  [user-id]
  (t2/select :model/User {:where [:not= :id user-id]}))
