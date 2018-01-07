(ns metabase.api.collection
  "/api/collection endpoints."
  (:require [compojure.core :refer [GET POST PUT]]
            [metabase.api
             [card :as card-api]
             [common :as api]]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [interface :as mi]
             [pulse :as pulse]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(api/defendpoint GET "/"
  "Fetch a list of all Collections that the current user has read permissions for.
  This includes `:can_write`, which means whether the current user is allowed to add or remove Cards to this
  Collection; keep in mind that regardless of this status you must be a superuser to modify properties of Collections
  themselves.

  By default, this returns non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`."
  [archived]
  {archived (s/maybe su/BooleanString)}
  (as-> (db/select Collection :archived (Boolean/parseBoolean archived)
                   {:order-by [[:%lower.name :asc]]}) collections
    (filter mi/can-read? collections)
    (hydrate collections :can_write)))

(api/defendpoint GET "/:id"
  "Fetch a specific (non-archived) Collection, including cards that belong to it."
  [id]
  ;; TODO - hydrate the `:cards` that belong to this Collection
  (assoc (api/read-check Collection id, :archived false)
    :cards (db/select Card, :collection_id id, :archived false)))

(api/defendpoint POST "/"
  "Create a new Collection."
  [:as {{:keys [name color description]} :body}]
  {name su/NonBlankString, color collection/hex-color-regex, description (s/maybe su/NonBlankString)}
  (api/check-superuser)
  (db/insert! Collection
    :name  name
    :color color))

(api/defendpoint PUT "/:id"
  "Modify an existing Collection, including archiving or unarchiving it."
  [id, :as {{:keys [name color description archived]} :body}]
  {name        su/NonBlankString
   color       collection/hex-color-regex
   description (s/maybe su/NonBlankString)
   archived    (s/maybe s/Bool)}
  ;; you have to be a superuser to modify a Collection itself, but `/collection/:id/` perms are sufficient for
  ;; adding/removing Cards
  (api/check-superuser)
  (api/api-let [404 "Not Found"] [collection-before-update (Collection id)]
    (db/update! Collection id
      :name        name
      :color       color
      :description description
      :archived    (if (nil? archived)
                     false
                     archived))
    (when (and (not (:archived collection-before-update))
               archived)
      (when-let [alerts (seq (apply pulse/retrieve-alerts-for-card (db/select-ids Card, :collection_id id)))]
        ;; When a collection is archived, all of it's cards are also marked as archived, but this is down in the model
        ;; layer which will not cause the archive notification code to fire. This will delete the relevant alerts and
        ;; notify the users just as if they had be archived individually via the card API
        (card-api/delete-alert-and-notify-archived! alerts))))

  ;; return the updated object
  (Collection id))


;;; ------------------------------------------------ GRAPH ENDPOINTS -------------------------------------------------

(api/defendpoint GET "/graph"
  "Fetch a graph of all Collection Permissions."
  []
  (api/check-superuser)
  (collection/graph))


(defn- ->int [id] (Integer/parseInt (name id)))

(defn- dejsonify-collections [collections]
  (into {} (for [[collection-id perms] collections]
             {(->int collection-id) (keyword perms)})))

(defn- dejsonify-groups [groups]
  (into {} (for [[group-id collections] groups]
             {(->int group-id) (dejsonify-collections collections)})))

(defn- dejsonify-graph
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"none\"` to `:none` and
  parsing object keys as integers."
  [graph]
  (update graph :groups dejsonify-groups))

(api/defendpoint PUT "/graph"
  "Do a batch update of Collections Permissions by passing in a modified graph."
  [:as {body :body}]
  {body su/Map}
  (api/check-superuser)
  (collection/update-graph! (dejsonify-graph body))
  (collection/graph))


(api/define-routes)
