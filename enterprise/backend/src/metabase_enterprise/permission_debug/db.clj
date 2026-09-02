(ns metabase-enterprise.permission-debug.db
  "Application database queries for the permission-debug module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn user-superuser?
  "Whether the User with `user-id` is a superuser."
  [user-id]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn query-rows
  "The rows of the Honey SQL `query`."
  [query]
  (t2/query query))
