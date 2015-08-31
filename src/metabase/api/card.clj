(ns metabase.api.card
  (:require [compojure.core :refer [GET POST DELETE PUT]]
            [korma.core :as k]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card] :as card]
                             [card-favorite :refer [CardFavorite]]
                             [common :as common]
                             [revision :refer [push-revision]]
                             [user :refer [User]])))

(defannotation CardFilterOption
  "Option must be one of `all`, `mine`, or `fav`."
  [symb value :nillable]
  (checkp-contains? #{:all :mine :fav} symb (keyword value)))

(defannotation CardDisplayType
  "Option must be a valid `display_type`."
  [symb value :nillable]
  (checkp-contains? card/display-types symb (keyword value)))

(defendpoint GET "/"
  "Get all the `Cards`. With param `f` (default is `all`), restrict cards as follows:

   *  `all`  Return all `Cards` which were created by current user or are publicly visible
   *  `mine` Return all `Cards` created by current user
   *  `fav`  Return all `Cards` favorited by the current user"
  [f]
  {f CardFilterOption}
  (-> (case (or f :all) ; default value for `f` is `:all`
        :all  (sel :many Card (k/order :name :ASC) (k/where (or {:creator_id *current-user-id*}
                                                              {:public_perms [> common/perms-none]})))
        :mine (sel :many Card :creator_id *current-user-id* (k/order :name :ASC))
        :fav  (->> (-> (sel :many [CardFavorite :card_id] :owner_id *current-user-id*)
                       (hydrate :card))
                   (map :card)
                   (sort-by :name)))
      (hydrate :creator)))

(defendpoint POST "/"
  "Create a new `Card`."
  [:as {{:keys [dataset_query description display name public_perms visualization_settings]} :body}]
  {name         [Required NonEmptyString]
   public_perms [Required PublicPerms]
   display      [Required CardDisplayType]}
  ;; TODO - which other params are required?
  (ins Card
    :creator_id             *current-user-id*
    :dataset_query          dataset_query
    :description            description
    :display                display
    :name                   name
    :public_perms           public_perms
    :visualization_settings visualization_settings))

(defendpoint GET "/:id"
  "Get `Card` with ID."
  [id]
  (->404 (Card id)
         read-check
         (hydrate :creator :can_read :can_write :dashboard_count)))

(defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [dataset_query description display name public_perms visualization_settings]} :body}]
  {name         NonEmptyString
   public_perms PublicPerms
   display      CardDisplayType}
  (write-check Card id)
  (check-500 (upd-non-nil-keys Card id
                               :dataset_query dataset_query
                               :description description
                               :display display
                               :name name
                               :public_perms public_perms
                               :visualization_settings visualization_settings))
  (push-revision :entity Card, :object (Card id)))

(defendpoint DELETE "/:id"
  "Delete a `Card`."
  [id]
  (write-check Card id)
  (cascade-delete Card :id id))

(defendpoint GET "/:id/favorite"
  "Has current user favorited this `Card`?"
  [id]
  {:favorite (boolean (some->> *current-user-id*
                               (exists? CardFavorite :card_id id :owner_id)))})

(defendpoint POST "/:card-id/favorite"
  "Favorite a Card."
  [card-id]
  (ins CardFavorite :card_id card-id :owner_id *current-user-id*))

(defendpoint DELETE "/:card-id/favorite"
  "Unfavorite a Card."
  [card-id]
  (let-404 [{:keys [id] :as card-favorite} (sel :one CardFavorite :card_id card-id :owner_id *current-user-id*)]
    (del CardFavorite :id id)))

(define-routes)
