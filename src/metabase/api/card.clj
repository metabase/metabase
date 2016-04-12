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
                             [table :refer [Table]]
                             [view-log :refer [ViewLog]])
            [metabase.util :as u]
            [metabase.util.korma-extensions :as kx]))

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
  (let [favorite-card-ids (set (sel :many :field [CardFavorite :card_id], :owner_id *current-user-id*, :card_id [in (map :id cards)]))]
    (for [card cards]
      (assoc card :favorite (contains? favorite-card-ids (:id card))))))

(defn- cards:all
  "Return all `Cards`."
  []
  (sel :many Card, :archived false, (k/order :name :ASC)))

(defn- cards:mine
  "Return all `Cards` created by current user."
  []
  (sel :many Card, :creator_id *current-user-id*, :archived false, (k/order :name :ASC)))

(defn- cards:fav
  "Return all `Cards` favorited by the current user."
  []
  (->> (hydrate (sel :many [CardFavorite :card_id], :owner_id *current-user-id*)
                :card)
       (map :card)
       (filter (complement :archived))
       (sort-by :name)))

(defn- cards:database
  "Return all `Cards` belonging to `Database` with DATABASE-ID."
  [database-id]
  (sel :many Card (k/order :name :ASC), :database_id database-id, :archived false))

(defn- cards:table
  "Return all `Cards` belonging to `Table` with TABLE-ID."
  [table-id]
  (sel :many Card (k/order :name :ASC), :table_id table-id, :archived false))

(defn- cards-with-ids
  "Return unarchived `Cards` with CARD-IDS.
   Make sure cards are returned in the same order as CARD-IDS`; `[in card-ids]` won't preserve the order."
  [card-ids]
  {:pre [(every? integer? card-ids)]}
  (let [card-id->card (sel :many :field->obj [Card :id], :id [in card-ids], :archived false)]
    (filter identity (map card-id->card card-ids))))

(defn- cards:recent
  "Return the 10 `Cards` most recently viewed by the current user, sorted by how recently they were viewed."
  []
  (cards-with-ids (map :model_id (k/select ViewLog
                                   (k/aggregate (max :timestamp) :max)
                                   (k/group :model_id)
                                   (k/fields :model_id)
                                   (k/where {:model (kx/literal "card"), :user_id *current-user-id*})
                                   (k/order :max :DESC)
                                   (k/limit 10)))))

(defn- cards:popular
  "All `Cards`, sorted by popularity (the total number of times they are viewed in `ViewLogs`).
   (yes, this isn't actually filtering anything, but for the sake of simplicitiy it is included amongst the filter options for the time being)."
  []
  (cards-with-ids (map :model_id (k/select ViewLog
                                   (k/aggregate (count (k/raw "*")) :count)
                                   (k/group :model_id)
                                   (k/fields :model_id)
                                   (k/where {:model (kx/literal "card")})
                                   (k/order :count :DESC)))))

(defn- cards:archived
  "`Cards` that have been archived."
  []
  (sel :many Card, :archived true, (k/order :name :ASC)))

(def ^:private filter-option->fn
  "Functions that should be used to return cards for a given filter option. These functions are all be called with `model-id` as the sole paramenter;
   functions that don't use the param discard it via `u/drop-first-arg`.

     ((filter->option->fn :recent) model-id) -> (cards:recent)"
  {:all      (u/drop-first-arg cards:all)
   :mine     (u/drop-first-arg cards:mine)
   :fav      (u/drop-first-arg cards:fav)
   :database cards:database
   :table    cards:table
   :recent   (u/drop-first-arg cards:recent)
   :popular  (u/drop-first-arg cards:popular)
   :archived (u/drop-first-arg cards:archived)})

(defn- card-has-label? [label-slug card]
  (contains? (set (map :slug (:labels card))) label-slug))

(defn- cards-for-filter-option [filter-option model-id label]
  (let [cards (-> ((filter-option->fn (or filter-option :all)) model-id)
                  (hydrate :creator)
                  hydrate-labels
                  hydrate-favorites)]
    ;; Since labels are hydrated in Clojure-land we need to wait until this point to apply label filtering if applicable
    (if-not (seq label)
      cards
      (filter (partial card-has-label? label) cards))))

(defannotation CardFilterOption
  "Option must be a valid card filter option."
  [symb value :nillable]
  (checkp-contains? (set (keys filter-option->fn)) symb (keyword value)))

(defendpoint GET "/"
  "Get all the `Cards`. Option filter param `f` can be used to change the set of Cards that are returned; default is `all`,
   but other options include `mine`, `fav`, `database`, `table`, `recent`, `popular`, and `archived`. See corresponding implementation
   functions above for the specific behavior of each filter option.

   Optionally filter cards by LABEL slug."
  [f model_id label]
  {f CardFilterOption, model_id Integer, label NonEmptyString}
  (when (contains? #{:database :table} f)
    (checkp (integer? model_id) "id" (format "id is required parameter when filter mode is '%s'" (name f)))
    (case f
      :database (read-check Database model_id)
      :table    (read-check Database (:db_id (sel :one :fields [Table :db_id] :id model_id)))))
  (cards-for-filter-option f model_id label))

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
  [id :as {{:keys [dataset_query description display name public_perms visualization_settings archived], :as body} :body}]
  {name                   NonEmptyString
   public_perms           PublicPerms
   display                NonEmptyString
   visualization_settings Dict
   archived               Boolean}
  (write-check Card id)
  (upd-non-nil-keys Card id
    :dataset_query          dataset_query
    :description            description
    :display                display
    :name                   name
    :public_perms           public_perms
    :visualization_settings visualization_settings
    :archived               archived)
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
