(ns metabase.bookmarks.api
  "Handle creating bookmarks for the user. Bookmarks are in three tables and should be thought of as a tuple of (model,
  model-id) rather than a row in a table with an id. The DELETE takes the model and id because DELETE's do not
  necessarily support request bodies. The POST is therefore shaped in this same manner. Since there are three
  underlying tables the id on the actual bookmark itself is not unique among \"bookmarks\" and is not a good
  identifier for using in the API."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.bookmarks.db :as bookmarks.db]
   [metabase.bookmarks.models.bookmark :as bookmark]
   [metabase.util.malli.schema :as ms]))

(def Models
  "Schema enumerating bookmarkable models."
  (into [:enum]
        ["card" "dashboard" "collection" "document" "exploration"]))

(def BookmarkOrderings
  "Schema for an ordered of bookmark orderings"
  [:sequential [:map
                [:type Models]
                [:item_id ms/PositiveInt]]])

(def ^:private item-model
  "Lookup map from model as a string to the underlying item model, for read-checks."
  {"card"        :model/Card
   "dashboard"   :model/Dashboard
   "collection"  :model/Collection
   "document"    :model/Document
   "exploration" :model/Exploration})

(defn- bookmark-exists? [model id user-id]
  (case model
    "card"        (bookmarks.db/card-bookmark-exists? id user-id)
    "dashboard"   (bookmarks.db/dashboard-bookmark-exists? id user-id)
    "collection"  (bookmarks.db/collection-bookmark-exists? id user-id)
    "document"    (bookmarks.db/document-bookmark-exists? id user-id)
    "exploration" (bookmarks.db/exploration-bookmark-exists? id user-id)))

(defn- insert-bookmark! [model id user-id]
  (case model
    "card"        (bookmarks.db/insert-card-bookmark! id user-id)
    "dashboard"   (bookmarks.db/insert-dashboard-bookmark! id user-id)
    "collection"  (bookmarks.db/insert-collection-bookmark! id user-id)
    "document"    (bookmarks.db/insert-document-bookmark! id user-id)
    "exploration" (bookmarks.db/insert-exploration-bookmark! id user-id)))

(defn- delete-bookmark! [model id user-id]
  (case model
    "card"        (bookmarks.db/delete-card-bookmark! id user-id)
    "dashboard"   (bookmarks.db/delete-dashboard-bookmark! id user-id)
    "collection"  (bookmarks.db/delete-collection-bookmark! id user-id)
    "document"    (bookmarks.db/delete-document-bookmark! id user-id)
    "exploration" (bookmarks.db/delete-exploration-bookmark! id user-id)))

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
  (api/read-check (item-model model) id)
  (api/check (not (bookmark-exists? model id api/*current-user-id*))
             [400 "Bookmark already exists"])
  (insert-bookmark! model id api/*current-user-id*))

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
  (delete-bookmark! model id api/*current-user-id*)
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
