(ns metabase.api.card
  (:require [compojure.core :refer [GET POST DELETE PUT]]
            [korma.core :as k]
            [medley.core :refer [mapply]]
            [metabase.events :as events]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card] :as card]
                             [card-favorite :refer [CardFavorite]]
                             [common :as common]
                             [database :refer [Database]]
                             [table :refer [Table]]
                             [user :refer [User]])))

(defannotation CardFilterOption
  "Option must be one of `all`, `mine`, or `fav`."
  [symb value :nillable]
  (checkp-contains? #{:all :mine :fav :database :table} symb (keyword value)))

(defannotation CardDisplayType
  "Option must be a valid `display_type`."
  [symb value :nillable]
  (checkp-contains? card/display-types symb (keyword value)))

(defendpoint GET "/"
  "Get all the `Cards`. With param `f` (default is `all`), restrict cards as follows:

   *  `all`         Return all `Cards`
   *  `mine`        Return all `Cards` created by current user
   *  `fav`         Return all `Cards` favorited by the current user
   *  `database`    Return all `Cards` with `:database_id` equal to `id`
   *  `table`       Return all `Cards` with `:table_id` equal to `id`

   All returned cards must be either created by current user or are publicly visible."
  [f model_id]
  {f CardFilterOption
   model_id Integer}
  (when (contains? #{:database :table} f)
    (checkp (integer? model_id) "id" (format "id is required parameter when filter mode is '%s'" (name f)))
    (case f
      :database (read-check Database model_id)
      :table    (read-check Database (:db_id (sel :one :fields [Table :db_id] :id model_id)))))
  (-> (case (or f :all) ; default value for `f` is `:all`
        :all      (sel :many Card (k/order :name :ASC) (k/where (or {:creator_id *current-user-id*}
                                                                    {:public_perms [> common/perms-none]})))
        :mine     (sel :many Card :creator_id *current-user-id* (k/order :name :ASC))
        :fav      (->> (-> (sel :many [CardFavorite :card_id] :owner_id *current-user-id*)
                           (hydrate :card))
                       (map :card)
                       (sort-by :name))
        :database (sel :many Card (k/order :name :ASC) (k/where (and {:database_id model_id}
                                                                  (or {:creator_id *current-user-id*}
                                                                      {:public_perms [> common/perms-none]}))))
        :table    (sel :many Card (k/order :name :ASC) (k/where (and {:table_id model_id}
                                                                     (or {:creator_id *current-user-id*}
                                                                         {:public_perms [> common/perms-none]})))))
      (hydrate :creator)))

(defendpoint POST "/"
  "Create a new `Card`."
  [:as {{:keys [dataset_query description display name public_perms visualization_settings]} :body}]
  {name         [Required NonEmptyString]
   public_perms [Required PublicPerms]
   display      [Required CardDisplayType]}
  (->> (ins Card
            :creator_id             *current-user-id*
            :dataset_query          dataset_query
            :description            description
            :display                display
            :name                   name
            :public_perms           public_perms
            :visualization_settings visualization_settings)
       (events/publish-event :card-create)))

(defendpoint GET "/:id"
  "Get `Card` with ID."
  [id]
  (->404 (Card id)
         read-check
         (hydrate :creator :can_read :can_write :dashboard_count)
         (assoc :actor_id *current-user-id*)
         (->> (events/publish-event :card-read))
         (dissoc :actor_id)))

(defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [dataset_query description display name public_perms visualization_settings]} :body}]
  {name         NonEmptyString
   public_perms PublicPerms
   display      CardDisplayType}
  (write-check Card id)
  (upd-non-nil-keys Card id
                    :dataset_query dataset_query
                    :description description
                    :display display
                    :name name
                    :public_perms public_perms
                    :visualization_settings visualization_settings)
  (events/publish-event :card-update (assoc (sel :one Card :id id) :actor_id *current-user-id*)))

(defendpoint DELETE "/:id"
  "Delete a `Card`."
  [id]
  (write-check Card id)
  (let [card (sel :one Card :id id)
        result (cascade-delete Card :id id)]
    (events/publish-event :card-delete (assoc card :actor_id *current-user-id*))
    result))

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
