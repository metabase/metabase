(ns metabase.api.card
  (:require [clojure.data.json :as json]
            [compojure.core :refer [GET POST DELETE PUT]]
            [korma.core :refer :all]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [card-favorite :refer [CardFavorite]]
                             [common :as common]
                             [org :refer [Org]]
                             [user :refer [User]])
            [metabase.util :as util]))

(defannotation CardFilterOption
  "Option must be one of `all`, `mine`, or `fav`."
  [symb value :nillable]
  (checkp-contains? #{:all :mine :fav} symb (keyword value)))

(defendpoint GET "/"
  "Get all the `Cards` for an `Org`. With param `f` (default is `all`), restrict cards as follows:

   *  `all`  Return all `Cards` for `Org` which were create by current user or are publicly visible
   *  `mine` Return all `Cards` for `Org` created by current user
   *  `fav`  Return all `Cards` favorited by the current user"
  [org f]
  {org Required, f CardFilterOption}
  (read-check Org org)
  (-> (case (or f :all) ; default value for `f` is `:all`
        :all  (sel :many Card :organization_id org (order :name :ASC) (where (or {:creator_id *current-user-id*}
                                                                                 {:public_perms [> common/perms-none]})))
        :mine (sel :many Card :organization_id org :creator_id *current-user-id* (order :name :ASC))
        :fav  (->> (-> (sel :many [CardFavorite :card_id] :owner_id *current-user-id*)
                       (hydrate :card))
                   (map :card)
                   (sort-by :name)))
      (hydrate :creator)))

(defendpoint POST "/"
  "Create a new `Card`."
  [:as {{:keys [dataset_query description display name organization public_perms visualization_settings]} :body}]
  {name         [Required NonEmptyString]
   public_perms [Required PublicPerms]}
  ;; TODO - which other params are required?
  (read-check Org organization)
  (ins Card
    :creator_id *current-user-id*
    :dataset_query dataset_query
    :description description
    :display display
    :name name
    :organization_id organization
    :public_perms public_perms
    :visualization_settings visualization_settings))

(defendpoint GET "/:id"
  "Get `Card` with ID."
  [id]
  (->404 (sel :one Card :id id)
         read-check
         (hydrate :can_read :can_write :organization)))

(defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [dataset_query description display name public_perms visualization_settings]} :body}]
  {name NonEmptyString, public_perms PublicPerms}
  (write-check Card id)
  (check-500 (upd-non-nil-keys Card id
                               :dataset_query dataset_query
                               :description description
                               :display display
                               :name name
                               :public_perms public_perms
                               :visualization_settings visualization_settings))
  (sel :one Card :id id))

(defendpoint DELETE "/:id"
  "Delete a `Card`."
  [id]
  (write-check Card id)
  (del Card :id id))

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
