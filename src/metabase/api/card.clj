(ns metabase.api.card
  (:require [clojure.data :as data]
            [compojure.core :refer [GET POST DELETE PUT]]
            (metabase.api [common :refer :all]
                          [dataset :as dataset-api])
            (metabase [db :as db]
                      [events :as events])
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card], :as card]
                             [card-favorite :refer [CardFavorite]]
                             [card-label :refer [CardLabel]]
                             [common :as common]
                             [database :refer [Database]]
                             [interface :as models]
                             [label :refer [Label]]
                             [permissions :as perms]
                             [table :refer [Table]]
                             [view-log :refer [ViewLog]])
            (metabase [query-processor :as qp]
                      [util :as u])))


;;; ------------------------------------------------------------ Hydration ------------------------------------------------------------

(defn- hydrate-labels
  "Efficiently hydrate the `Labels` for a large collection of `Cards`."
  [cards]
  (let [card-labels          (db/select [CardLabel :card_id :label_id])
        label-id->label      (when (seq card-labels)
                               (u/key-by :id (db/select Label :id [:in (map :label_id card-labels)])))
        card-id->card-labels (group-by :card_id card-labels)]
    (for [card cards]
      (assoc card :labels (for [card-label (card-id->card-labels (:id card))] ; TODO - do these need to be sorted ?
                            (label-id->label (:label_id card-label)))))))

(defn- hydrate-favorites
  "Efficiently add `favorite` status for a large collection of `Cards`."
  [cards]
  (when (seq cards)
    (let [favorite-card-ids (set (db/select-field :card_id CardFavorite, :owner_id *current-user-id*, :card_id [:in (map :id cards)]))]
      (for [card cards]
        (assoc card :favorite (contains? favorite-card-ids (:id card)))))))


;;; ------------------------------------------------------------ Filtered Fetch Fns ------------------------------------------------------------

(defn- cards:all
  "Return all `Cards`."
  []
  (db/select Card, :archived false, {:order-by [[:name :asc]]}))

(defn- cards:mine
  "Return all `Cards` created by current user."
  []
  (db/select Card, :creator_id *current-user-id*, :archived false, {:order-by [[:name :asc]]}))

(defn- cards:fav
  "Return all `Cards` favorited by the current user."
  []
  (->> (hydrate (db/select [CardFavorite :card_id], :owner_id *current-user-id*)
                :card)
       (map :card)
       (filter (complement :archived))
       (sort-by :name)))

(defn- cards:database
  "Return all `Cards` belonging to `Database` with DATABASE-ID."
  [database-id]
  (db/select Card, :database_id database-id, :archived false, {:order-by [[:name :asc]]}))

(defn- cards:table
  "Return all `Cards` belonging to `Table` with TABLE-ID."
  [table-id]
  (db/select Card, :table_id table-id, :archived false, {:order-by [[:name :asc]]}))

(defn- cards-with-ids
  "Return unarchived `Cards` with CARD-IDS.
   Make sure cards are returned in the same order as CARD-IDS`; `[in card-ids]` won't preserve the order."
  [card-ids]
  {:pre [(every? integer? card-ids)]}
  (let [card-id->card (u/key-by :id (db/select Card, :id [:in (set card-ids)], :archived false))]
    (filter identity (map card-id->card card-ids))))

(defn- cards:recent
  "Return the 10 `Cards` most recently viewed by the current user, sorted by how recently they were viewed."
  []
  (cards-with-ids (map :model_id (db/select [ViewLog :model_id [:%max.timestamp :max]]
                                   :model   "card"
                                   :user_id *current-user-id*
                                   {:group-by [:model_id]
                                    :order-by [[:max :desc]]
                                    :limit    10}))))

(defn- cards:popular
  "All `Cards`, sorted by popularity (the total number of times they are viewed in `ViewLogs`).
   (yes, this isn't actually filtering anything, but for the sake of simplicitiy it is included amongst the filter options for the time being)."
  []
  (cards-with-ids (map :model_id (db/select [ViewLog :model_id [:%count.* :count]]
                                   :model "card"
                                   {:group-by [:model_id]
                                    :order-by [[:count :desc]]}))))

(defn- cards:archived
  "`Cards` that have been archived."
  []
  (db/select Card, :archived true, {:order-by [[:name :asc]]}))

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


;;; ------------------------------------------------------------ /api/card & /api/card/:id endpoints ------------------------------------------------------------

(defannotation CardFilterOption
  "Option must be a valid card filter option."
  [symb value :nillable]
  (checkp-contains? (set (keys filter-option->fn)) symb (keyword value)))

(defendpoint GET "/"
  "Get all the `Cards`. Option filter param `f` can be used to change the set of Cards that are returned; default is `all`,
   but other options include `mine`, `fav`, `database`, `table`, `recent`, `popular`, and `archived`. See corresponding implementation
   functions above for the specific behavior of each filter option. :card_index:

   Optionally filter cards by LABEL slug."
  [f model_id label]
  {f CardFilterOption, model_id Integer, label NonEmptyString}
  (when (contains? #{:database :table} f)
    (checkp (integer? model_id) "id" (format "id is required parameter when filter mode is '%s'" (name f)))
    (case f
      :database (read-check Database model_id)
      :table    (read-check Database (db/select-one-field :db_id Table, :id model_id))))
  (->> (cards-for-filter-option f model_id label)
       (filterv models/can-read?))) ; filterv because we want make sure all the filtering is done while current user perms set is still bound


(defendpoint POST "/"
  "Create a new `Card`."
  [:as {{:keys [dataset_query description display name visualization_settings]} :body}]
  {name                   [Required NonEmptyString]
   display                [Required NonEmptyString]
   visualization_settings [Required Dict]}
  (check-403 (perms/set-has-full-permissions-for-set? @*current-user-permissions-set* (card/query-perms-set dataset_query :write)))
  (->> (db/insert! Card
         :creator_id             *current-user-id*
         :dataset_query          dataset_query
         :description            description
         :display                display
         :name                   name
         :visualization_settings visualization_settings)
       (events/publish-event :card-create)))


(defendpoint GET "/:id"
  "Get `Card` with ID."
  [id]
  (-> (read-check Card id)
      (hydrate :creator :dashboard_count :labels)
      (assoc :actor_id *current-user-id*)
      (->> (events/publish-event :card-read))
      (dissoc :actor_id)))


(defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [dataset_query description display name visualization_settings archived], :as body} :body}]
  {name                   NonEmptyString
   display                NonEmptyString
   visualization_settings Dict
   archived               Boolean}
  (let [card (write-check Card id)]
    (db/update-non-nil-keys! Card id
      :dataset_query          dataset_query
      :description            description
      :display                display
      :name                   name
      :visualization_settings visualization_settings
      :archived               archived)
    (let [event (cond
                  ;; card was archived
                  (and archived
                       (not (:archived card))) :card-archive
                  ;; card was unarchived
                  (and (not (nil? archived))
                       (not archived)
                       (:archived card))       :card-unarchive
                  :else                        :card-update)]
      (events/publish-event event (assoc (Card id) :actor_id *current-user-id*)))))


(defendpoint DELETE "/:id"
  "Delete a `Card`."
  [id]
  (let [card (write-check Card id)]
    (u/prog1 (db/cascade-delete! Card :id id)
      (events/publish-event :card-delete (assoc card :actor_id *current-user-id*)))))


;;; ------------------------------------------------------------ Favoriting ------------------------------------------------------------


(defendpoint GET "/:card-id/favorite"
  "Has current user favorited this `Card`?"
  [card-id]
  (read-check Card card-id)
  {:favorite (db/exists? CardFavorite :card_id card-id, :owner_id *current-user-id*)})

(defendpoint POST "/:card-id/favorite"
  "Favorite a Card."
  [card-id]
  (read-check Card card-id)
  (db/insert! CardFavorite :card_id card-id, :owner_id *current-user-id*))


(defendpoint DELETE "/:card-id/favorite"
  "Unfavorite a Card."
  [card-id]
  (read-check Card card-id)
  (let-404 [id (db/select-one-id CardFavorite :card_id card-id, :owner_id *current-user-id*)]
    (db/cascade-delete! CardFavorite, :id id)))


;;; ------------------------------------------------------------ Editing Card Labels ------------------------------------------------------------


(defendpoint POST "/:card-id/labels"
  "Update the set of `Labels` that apply to a `Card`."
  [card-id :as {{:keys [label_ids]} :body}]
  {label_ids [Required ArrayOfIntegers]}
  (write-check Card card-id)
  (let [[labels-to-remove labels-to-add] (data/diff (set (db/select-field :label_id CardLabel :card_id card-id))
                                                    (set label_ids))]
    (when (seq labels-to-remove)
      (db/cascade-delete! CardLabel, :label_id [:in labels-to-remove], :card_id card-id))
    (doseq [label-id labels-to-add]
      (db/insert! CardLabel :label_id label-id, :card_id card-id)))
  {:status :ok})


;;; ------------------------------------------------------------ Running a Query ------------------------------------------------------------

(defendpoint POST "/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters timeout]} :body}]
  (let [card  (read-check Card card-id)
        query (assoc (:dataset_query card)
                :parameters  parameters
                :constraints dataset-api/query-constraints)]
    ;; Now run the query!
    (let [options {:executed-by *current-user-id*
                   :card-id     card-id}]
      (qp/dataset-query query options))))


(define-routes)
