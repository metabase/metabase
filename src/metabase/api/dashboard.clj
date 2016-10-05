(ns metabase.api.dashboard
  "/api/dashboard endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [metabase.events :as events]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [common :as common]
                             [dashboard :refer [Dashboard], :as dashboard]
                             [dashboard-card :refer [DashboardCard create-dashboard-card! update-dashboard-card! delete-dashboard-card!]]
                             [interface :as models]
                             [hydrate :refer [hydrate]])
            [metabase.models.revision :as revision]
            [metabase.util :as u]))


(defn- dashboards-list [filter-option]
  (filter models/can-read? (-> (db/select Dashboard {:where (case (or filter-option :all)
                                                              :all  true
                                                              :mine [:= :creator_id *current-user-id*])})
                               (hydrate :creator))))

(defendpoint GET "/"
  "Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:

  *  `all` - Return all `Dashboards`.
  *  `mine` - Return `Dashboards` created by the current user."
  [f]
  {f FilterOptionAllOrMine}
  (dashboards-list f))


(defendpoint POST "/"
  "Create a new `Dashboard`."
  [:as {{:keys [name parameters], :as dashboard} :body}]
  {name       [Required NonEmptyString]
   parameters [ArrayOfMaps]}
  (dashboard/create-dashboard! dashboard *current-user-id*))

(defn- hide-unreadable-card
  "If CARD is unreadable, replace it with an object containing only its `:id`."
  [card]
  (if (models/can-read? card)
    card
    (select-keys card [:id])))

(defn- hide-unreadable-cards
  "Replace the `:card` and `:series` entries from dashcards that they user isn't allowed to read with empty objects."
  [dashboard]
  (update dashboard :ordered_cards (partial mapv (fn [dashcard]
                                                   (-> dashcard
                                                       (update :card hide-unreadable-card)
                                                       (update :series (partial mapv hide-unreadable-card)))))))

(defendpoint GET "/:id"
  "Get `Dashboard` with ID."
  [id]
  (u/prog1 (-> (Dashboard id)
               (hydrate :creator [:ordered_cards [:card :creator] :series])
               read-check
               hide-unreadable-cards)
    (events/publish-event :dashboard-read (assoc <> :actor_id *current-user-id*))))


(defendpoint PUT "/:id"
  "Update a `Dashboard`."
  [id :as {{:keys [description name parameters caveats points_of_interest show_in_getting_started], :as dashboard} :body}]
  {name       [Required NonEmptyString]
   parameters [ArrayOfMaps]}
  (write-check Dashboard id)
  (check-500 (-> (assoc dashboard :id id)
                 (dashboard/update-dashboard! *current-user-id*))))


(defendpoint DELETE "/:id"
  "Delete a `Dashboard`."
  [id]
  (let [dashboard (write-check Dashboard id)]
    (u/prog1 (db/cascade-delete! Dashboard :id id)
      (events/publish-event :dashboard-delete (assoc dashboard :actor_id *current-user-id*)))))


(defendpoint POST "/:id/cards"
  "Add a `Card` to a `Dashboard`."
  [id :as {{:keys [cardId parameter_mappings series] :as dashboard-card} :body}]
  {cardId             [Required Integer]
   parameter_mappings [ArrayOfMaps]}
  (write-check Dashboard id)
  (read-check Card cardId)
  (let [defaults       {:dashboard_id           id
                        :card_id                cardId
                        :visualization_settings {}
                        :creator_id             *current-user-id*
                        :series                 (or series [])}
        dashboard-card (-> (merge dashboard-card defaults)
                           (update :series #(filter identity (map :id %))))]
    (let-500 [result (create-dashboard-card! dashboard-card)]
      (events/publish-event :dashboard-add-cards {:id id :actor_id *current-user-id* :dashcards [result]})
      result)))


(defendpoint PUT "/:id/cards"
  "Update `Cards` on a `Dashboard`. Request body should have the form:

    {:cards [{:id ...
              :sizeX ...
              :sizeY ...
              :row ...
              :col ...
              :series [{:id 123
                        ...}]} ...]}"
  [id :as {{:keys [cards]} :body}]
  (write-check Dashboard id)
  (let [dashcard-ids (db/select-ids DashboardCard, :dashboard_id id)]
    (doseq [{dashcard-id :id, :as dashboard-card} cards]
      ;; ensure the dashcard we are updating is part of the given dashboard
      (when (contains? dashcard-ids dashcard-id)
        (update-dashboard-card! (update dashboard-card :series #(filter identity (map :id %)))))))
  (events/publish-event :dashboard-reposition-cards {:id id :actor_id *current-user-id* :dashcards cards})
  {:status :ok})


(defendpoint DELETE "/:id/cards"
  "Remove a `DashboardCard` from a `Dashboard`."
  [id dashcardId]
  {dashcardId [Required String->Integer]}
  (write-check Dashboard id)
  (when-let [dashboard-card (DashboardCard dashcardId)]
    (check-500 (delete-dashboard-card! dashboard-card *current-user-id*))
    {:success true}))


(defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Dashboard` with ID."
  [id]
  (read-check Dashboard id)
  (revision/revisions+details Dashboard id))


(defendpoint POST "/:id/revert"
  "Revert a `Dashboard` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id [Required Integer]}
  (write-check Dashboard id)
  (revision/revert!
    :entity      Dashboard
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))


(define-routes)
