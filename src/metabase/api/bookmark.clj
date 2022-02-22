(ns metabase.api.bookmark
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models.bookmark :as bookmarks
             :refer [CardBookmark DashboardBookmark CollectionBookmark]]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def Models (s/enum "card" "dashboard" "collection"))

(api/defendpoint GET "/"
  "Fetch all bookmarks for the user"
  []
  (bookmarks/bookmarks-for-user api/*current-user-id*))

(def ^:private lookup
  "Lookup map from model as a string to [model bookmark-model item-id-key]."
  {"card"       [Card       CardBookmark       :card_id]
   "dashboard"  [Dashboard  DashboardBookmark  :dashboard_id]
   "collection" [Collection CollectionBookmark :collection_id]})

(api/defendpoint POST "/"
  "Create a new bookmark for user."
  [:as {{:keys [model id]} :body}]
  {model Models
   id    su/IntGreaterThanZero}
  (let [[item-model bookmark-model item-key] (lookup model)]
    (api/read-check item-model id)
    (db/insert! bookmark-model {item-key id :user_id api/*current-user-id*})))

(api/defendpoint DELETE "/:model/:id"
  "Delete a bookmark. Will delete a bookmark assigned to the user making the request by model and id."
  [model id]
  {model Models
   id    su/IntGreaterThanZero}
  (let [[_ bookmark-model item-key] (lookup model)]
    (db/delete! bookmark-model
                :user_id api/*current-user-id*
                item-key id)
    api/generic-204-no-content))

(api/define-routes)
