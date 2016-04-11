(ns metabase.api.card
  (:require [clojure.data :as data]
            [compojure.core :refer [GET POST DELETE PUT]]
            [korma.core :as k]
            [metabase.events :as events]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card] :as card]
                             [card-favorite :refer [CardFavorite]]
                             [card-label :refer [CardLabel]]
                             [common :as common]
                             [database :refer [Database]]
                             [label :refer [Label]]
                             [table :refer [Table]])
            [metabase.util :as u]))

(defannotation CardFilterOption
  "Option must be one of `all`, `mine`, or `fav`."
  [symb value :nillable]
  (checkp-contains? #{:all :mine :fav :database :table} symb (keyword value)))

(defn- hydrate-labels
  "Efficiently hydrate the `Labels` for a large collection of `Cards`."
  [cards]
  (let [card-labels          (sel :many :fields [CardLabel :card_id :label_id])
        label-id->label      (when (seq card-labels)
                               (sel :many :field->obj [Label :id] (k/where {:id [in (set (map :label_id card-labels))]})))
        card-id->card-labels (group-by :card_id card-labels)]
    (for [card cards]
      (assoc card :labels (for [card-label (card-id->card-labels (:id card))] ; TODO - do these need to be sorted ?
                            (label-id->label (:label_id card-label)))))))

(defn- hydrate-favorites
  "Efficiently add `favorite` status for a large collection of `Cards`."
  [cards]
  (let [favorite-card-ids (set (sel :many :field [CardFavorite :card_id], :owner_id *current-user-id*, :id [in (map :id cards)]))]
    (for [card cards]
      (assoc card :favorite (contains? favorite-card-ids (:id card))))))

(defn- cards:all []
  (sel :many Card (k/order :name :ASC) (k/where (or {:creator_id *current-user-id*}
                                                    {:public_perms [> common/perms-none]}))))

(defn- cards:mine []
  (sel :many Card :creator_id *current-user-id* (k/order :name :ASC)))

(defn- cards:fav []
  (->> (hydrate (sel :many [CardFavorite :card_id] :owner_id *current-user-id*)
                :card)
       (map :card)
       (sort-by :name)))

(defn- cards:database [database-id]
  (sel :many Card (k/order :name :ASC) (k/where (and {:database_id database-id}
                                                     (or {:creator_id *current-user-id*}
                                                         {:public_perms [> common/perms-none]})))))

(defn- cards:table [table-id]
  (sel :many Card (k/order :name :ASC) (k/where (and {:table_id table-id}
                                                     (or {:creator_id *current-user-id*}
                                                         {:public_perms [> common/perms-none]})))))

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
        :all      (cards:all)
        :mine     (cards:mine)
        :fav      (cards:fav)
        :database (cards:database model_id)
        :table    (cards:table model_id))
      (hydrate :creator)
      hydrate-labels
      hydrate-favorites))

(defendpoint POST "/"
  "Create a new `Card`."
  [:as {{:keys [dataset_query description display name public_perms visualization_settings]} :body}]
  {name         [Required NonEmptyString]
   public_perms [Required PublicPerms]
   display      [Required NonEmptyString]}
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
         (hydrate :creator :can_read :can_write :dashboard_count :labels)
         (assoc :actor_id *current-user-id*)
         (->> (events/publish-event :card-read))
         (dissoc :actor_id)))

(defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [dataset_query description display name public_perms visualization_settings]} :body}]
  {name         NonEmptyString
   public_perms PublicPerms
   display      NonEmptyString}
  (write-check Card id)
  (upd-non-nil-keys Card id
                    :dataset_query dataset_query
                    :description description
                    :display display
                    :name name
                    :public_perms public_perms
                    :visualization_settings visualization_settings)
  (events/publish-event :card-update (assoc (Card id) :actor_id *current-user-id*)))

(defendpoint DELETE "/:id"
  "Delete a `Card`."
  [id]
  (write-check Card id)
  (let-404 [card (sel :one Card :id id)]
    (write-check card)
    (u/prog1 (cascade-delete Card :id id)
      (events/publish-event :card-delete (assoc card :actor_id *current-user-id*)))))

(defendpoint GET "/:id/favorite"
  "Has current user favorited this `Card`?"
  [id]
  {:favorite (boolean (when *current-user-id*
                        (exists? CardFavorite :card_id, id :owner_id *current-user-id*)))})

(defendpoint POST "/:card-id/favorite"
  "Favorite a Card."
  [card-id]
  (ins CardFavorite :card_id card-id, :owner_id *current-user-id*))

(defendpoint DELETE "/:card-id/favorite"
  "Unfavorite a Card."
  [card-id]
  (let-404 [id (sel :one :id CardFavorite :card_id card-id, :owner_id *current-user-id*)]
    (del CardFavorite :id id)))

(defendpoint POST "/:card-id/labels"
  "Update the set of `Labels` that apply to a `Card`."
  [card-id :as {{:keys [label_ids]} :body}]
  {label_ids [Required ArrayOfIntegers]}
  (write-check Card card-id)
  (let [[labels-to-remove labels-to-add] (data/diff (set (sel :many :field [CardLabel :label_id] :card_id card-id))
                                                    (set label_ids))]
    (doseq [label-id labels-to-remove]
      (cascade-delete CardLabel :label_id label-id, :card_id card-id))
    (doseq [label-id labels-to-add]
      (ins CardLabel :label_id label-id, :card_id card-id)))
  ;; TODO - Should this endpoint return something more useful instead ?
  {:status :ok})

(define-routes)
