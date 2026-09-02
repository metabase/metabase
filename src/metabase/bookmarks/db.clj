(ns metabase.bookmarks.db
  "Application database queries for the bookmarks module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn bookmark-exists?
  "Whether the User with `user-id` has a `bookmark-model` bookmark whose `item-key` is `item-id`."
  [bookmark-model item-key item-id user-id]
  (t2/exists? bookmark-model item-key item-id :user_id user-id))

(defn insert-bookmark!
  "Insert the `bookmark-model` `row` and return the inserted instance."
  [bookmark-model row]
  (t2/insert-returning-instance! bookmark-model row))

(defn delete-bookmark!
  "Delete the `bookmark-model` bookmark of the User with `user-id` whose `item-key` is `item-id`."
  [bookmark-model user-id item-key item-id]
  (t2/delete! bookmark-model :user_id user-id item-key item-id))

(defn delete-bookmark-orderings-for-user!
  "Delete the BookmarkOrderings of the User with `user-id`."
  [user-id]
  (t2/delete! :model/BookmarkOrdering :user_id user-id))

(defn insert-bookmark-orderings!
  "Insert the BookmarkOrdering `rows`."
  [rows]
  (t2/insert! :model/BookmarkOrdering rows))
