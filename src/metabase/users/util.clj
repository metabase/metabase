(ns metabase.users.util
  (:require
   [metabase.api.common :as api]
   [metabase.users.db :as users.db]
   [metabase.users.models.user :as user]))

(defn check-self-or-superuser
  "Check that `user-id` is *current-user-id*` or that `*current-user*` is a superuser, or throw a 403."
  [user-id]
  {:pre [(integer? user-id)]}
  (api/check-403
   (or
    (= user-id api/*current-user-id*)
    api/*is-superuser?*)))

(defn fetch-user
  "Implementation for `/api/user` endpoints; fetch a User from the app DB by `:id`, optionally requiring `:type`
   and/or `:is_active` to match."
  [& {:keys [id type is_active]}]
  (users.db/admin-or-self-visible-user user/admin-or-self-visible-columns id :type type :is-active? is_active))

(defn filter-clauses-without-paging
  "Given a where clause, return a clause that can be used to count."
  [clauses]
  (dissoc clauses :order-by :limit :offset))
