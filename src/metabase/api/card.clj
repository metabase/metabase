(ns metabase.api.card
  (:require [clojure.data.json :as json]
            [compojure.core :refer [GET POST DELETE PUT]]
            [korma.core :refer :all]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate simple-batched-hydrate]]
                             [card :refer [Card]]
                             [card-favorite :refer [CardFavorite]]
                             [user :refer [User]])
            [metabase.util :as util]))

(defendpoint GET "/" [org f]
  (-> (case (or (keyword f) :all) ; default value for `f` is `:all`
                :all (sel :many Card :organization_id org (order :name :ASC))
                :mine (sel :many Card :organization_id org :creator_id *current-user-id* (order :name :ASC))
                :fav (->> (-> (sel :many [CardFavorite :card_id] :owner_id *current-user-id*)
                              (hydrate :card))
                          (map :card)
                          (sort-by :name)))
      (hydrate :creator))) ; TODO maybe do a batched hydrate here instead?

(defendpoint POST "/" [:as {:keys [body]}]
  (->> (-> body
           (select-keys [:dataset_query :description :display :name :organization :public_perms :visualization_settings])
           (clojure.set/rename-keys {:organization :organization_id} )
           (assoc :creator_id *current-user-id*))
       (mapply ins Card)))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Card :id id)
         (hydrate :can_read :can_write :organization)))

(defendpoint PUT "/:id" [id :as {:keys [body]}]
  (let-404 [{:keys [can_write] :as card} (sel :one Card :id id)]
    (check-403 @can_write)
    (check-500 (->> (util/select-non-nil-keys body :dataset_query :description :display :name :public_perms :visualization_settings)
                    (mapply upd Card id)))
    (sel :one Card :id id)))

(defendpoint DELETE "/:id" [id]
  (let-404 [{:keys [can_write]} (sel :one Card :id id)]
    (check-403 @can_write)
    (del Card :id id)))

(defendpoint GET "/:id/favorite" [id]
  {:favorite (boolean (some->> *current-user-id*
                               (sel :one CardFavorite :card_id id :owner_id)))})

(defendpoint POST "/:card-id/favorite" [card-id]
  (ins CardFavorite :card_id card-id :owner_id *current-user-id*))

(defendpoint DELETE "/:card-id/favorite" [card-id]
  (let-404 [{:keys [id] :as card-favorite} (sel :one CardFavorite :card_id card-id :owner_id *current-user-id*)]
    (del CardFavorite :id id)))

(define-routes)
