(ns metabase.bookmarks.write
  "The write functions of bookmarks, through which every writer creates, updates and deletes them."
  (:require
   [metabase.bookmarks.db :as bookmarks.db]
   [metabase.bookmarks.schema :as bookmarks.schema]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mu/defn create-bookmark!
  "Give the User with `user-id` a bookmark on (`model`, `id`), a bookmarkable model string, and return it, the existing
  one when there already is one; for the REST API and the MCP tools, which read-check the item."
  [model   :- ::bookmarks.schema/bookmark-ordering.type
   id      :- ms/PositiveInt
   user-id :- ::lib.schema.id/user]
  (bookmarks.db/insert-bookmark! model id user-id))

(mu/defn delete-bookmark!
  "Delete the bookmark of the User with `user-id` on (`model`, `id`), a bookmarkable model string, if there is one; for
  the REST API and the MCP tools."
  [model   :- ::bookmarks.schema/bookmark-ordering.type
   id      :- ms/PositiveInt
   user-id :- ::lib.schema.id/user]
  (bookmarks.db/delete-bookmark! model id user-id))

(mu/defn save-ordering!
  "Save the bookmark ordering of the User with `user-id`, `orderings` of shape `[{:type, :item_id}]`, deleting all
  existing orderings of the User, so `orderings` must be a total ordering; for the REST API."
  [user-id   :- ::lib.schema.id/user
   orderings :- [:sequential [:map {:closed true}
                              [:type    ::bookmarks.schema/bookmark-ordering.type]
                              [:item_id ms/PositiveInt]]]]
  (bookmarks.db/delete-bookmark-orderings-for-user! user-id)
  (bookmarks.db/insert-bookmark-orderings! (->> orderings
                                                (map #(select-keys % [:type :item_id]))
                                                (map-indexed #(assoc %2 :user_id user-id :ordering %1)))))

(mu/defn update-collection-bookmark! :- :int
  "Apply `changes` to `bookmark-or-id`, a CollectionBookmark the caller already loaded or the id of one, checking that
  the Collection it moves to can hold it, returning the number of bookmarks updated."
  [bookmark-or-id :- [:or ms/PositiveInt :map]
   changes        :- ::bookmarks.schema/collection-bookmark.update
   _opts          :- ::bookmarks.schema/write-opts]
  (let [bookmark (if (map? bookmark-or-id) bookmark-or-id (bookmarks.db/collection-bookmark bookmark-or-id))
        changes  (when bookmark (into {} (remove (fn [[k v]] (= v (get bookmark k)))) changes))]
    (if (empty? changes)
      0
      (do
        (collection/check-allowed-content :model/CollectionBookmark (:collection_id changes))
        (bookmarks.db/update-collection-bookmark! (:id bookmark) changes)))))

(defmethod mi/write-fns :model/CollectionBookmark
  [_model]
  {:update! update-collection-bookmark!})
