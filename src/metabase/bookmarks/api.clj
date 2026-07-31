(ns metabase.bookmarks.api
  "Handle creating bookmarks for the user. Bookmarks are in three tables and should be thought of as a tuple of (model,
  model-id) rather than a row in a table with an id. The DELETE takes the model and id because DELETE's do not
  necessarily support request bodies. The POST is therefore shaped in this same manner. Since there are three
  underlying tables the id on the actual bookmark itself is not unique among \"bookmarks\" and is not a good
  identifier for using in the API."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as app-db]
   [metabase.bookmarks.models.bookmark :as bookmark]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def Models
  "Schema enumerating bookmarkable models."
  (into [:enum]
        ["card" "dashboard" "collection" "document"]))

(def BookmarkOrderings
  "Schema for an ordered of bookmark orderings"
  [:sequential [:map
                [:type Models]
                [:item_id ms/PositiveInt]]])

(def ^:private lookup
  "Lookup map from model as a string to [model bookmark-model item-id-key]."
  {"card" [:model/Card :model/CardBookmark :card_id]
   "dashboard"  [:model/Dashboard  :model/DashboardBookmark  :dashboard_id]
   "collection" [:model/Collection :model/CollectionBookmark :collection_id]
   "document" [:model/Document :model/DocumentBookmark :document_id]})

(defn- bookmarked?
  "Does `user-id` have a bookmark on (`model`, `id`)? `model` is one of [[Models]]."
  [model id user-id]
  (let [[_ bookmark-model item-key] (lookup model)]
    (t2/exists? bookmark-model item-key id :user_id user-id)))

(defn bookmark!
  "Give `user-id` a bookmark on (`model`, `id`) and return it — the existing one when there already
  is one, so concurrent callers both get the state they asked for rather than one of them losing to
  the (user_id, item) unique constraint. Does not read-check the item — callers do."
  [model id user-id]
  (let [[_ bookmark-model item-key] (lookup model)]
    (app-db/select-or-insert! bookmark-model {item-key id :user_id user-id} (constantly {}))))

(defn un-bookmark!
  "Delete `user-id`'s bookmark on (`model`, `id`). No-op when there is none."
  [model id user-id]
  (let [[_ bookmark-model item-key] (lookup model)]
    (t2/delete! bookmark-model :user_id user-id item-key id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch all bookmarks for the user"
  []
  ;; already sorted by created_at in query. Can optionally use user sort preferences here and not in the function
  ;; below
  (bookmark/bookmarks-for-user api/*current-user-id*))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:model/:id"
  "Create a new bookmark for user."
  [{:keys [model id]} :- [:map
                          [:model Models]
                          [:id    ms/PositiveInt]]]
  (let [[item-model] (lookup model)]
    (api/read-check item-model id)
    (api/check (not (bookmarked? model id api/*current-user-id*))
               [400 "Bookmark already exists"])
    (bookmark! model id api/*current-user-id*)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:model/:id"
  "Delete a bookmark. Will delete a bookmark assigned to the user making the request by model and id."
  [{:keys [model id]} :- [:map
                          [:model Models]
                          [:id    ms/PositiveInt]]]
  ;; todo: allow admins to include an optional user id to delete for so they can delete other's bookmarks.
  (un-bookmark! model id api/*current-user-id*)
  api/generic-204-no-content)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/ordering"
  "Sets the order of bookmarks for user."
  [_route-params
   _query-params
   {:keys [orderings]} :- [:map
                           [:orderings BookmarkOrderings]]]
  (bookmark/save-ordering! api/*current-user-id* orderings)
  api/generic-204-no-content)
