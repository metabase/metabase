(ns metabase.api.bookmark
  "Handle creating bookmarks for the user. Bookmarks are in three tables and should be thought of as a tuple of (model,
  model-id) rather than a row in a table with an id. The DELETE takes the model and id because DELETE's do not
  necessarily support request bodies. The POST is therefore shaped in this same manner. Since there are three
  underlying tables the id on the actual bookmark itself is not unique among \"bookmarks\" and is not a good
  identifier for using in the API."
  (:require [compojure.core :refer [DELETE GET POST]]
            [metabase.api.common :as api]
            [metabase.models.bookmark :as bookmarks
             :refer [CardBookmark CollectionBookmark DashboardBookmark]]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def Models
  "Schema enumerating bookmarkable models."
  (s/enum "card" "dashboard" "collection"))

(def BookmarkOrderings
  "Schema for an ordered of boomark orderings"
  [{:type Models
    :item_id su/IntGreaterThanZero}])

(def ^:private lookup
  "Lookup map from model as a string to [model bookmark-model item-id-key]."
  {"card"       [Card       CardBookmark       :card_id]
   "dashboard"  [Dashboard  DashboardBookmark  :dashboard_id]
   "collection" [Collection CollectionBookmark :collection_id]})

(api/defendpoint GET "/"
  "Fetch all bookmarks for the user"
  []
  ;; already sorted by created_at in query. Can optionally use user sort preferences here and not in the function
  ;; below
  (bookmarks/bookmarks-for-user api/*current-user-id*))

(api/defendpoint POST "/:model/:id"
  "Create a new bookmark for user."
  [model id]
  {model Models
   id    su/IntGreaterThanZero}
  (let [[item-model bookmark-model item-key] (lookup model)]
    (api/read-check item-model id)
    (api/check (not (db/exists? bookmark-model item-key id
                                :user_id api/*current-user-id*))
      [400 "Bookmark already exists"])
    (db/insert! bookmark-model {item-key id :user_id api/*current-user-id*})))

(api/defendpoint DELETE "/:model/:id"
  "Delete a bookmark. Will delete a bookmark assigned to the user making the request by model and id."
  [model id]
  {model Models
   id    su/IntGreaterThanZero}
  ;; todo: allow admins to include an optional user id to delete for so they can delete other's bookmarks.
  (let [[_ bookmark-model item-key] (lookup model)]
    (db/delete! bookmark-model
                :user_id api/*current-user-id*
                item-key id)
    api/generic-204-no-content))

(api/defendpoint PUT "/ordering"
  "Sets the order of bookmarks for user."
  [:as {{:keys [orderings]} :body}]
  {orderings BookmarkOrderings}
  (bookmarks/save-ordering api/*current-user-id* orderings)
  api/generic-204-no-content)

(api/define-routes)
