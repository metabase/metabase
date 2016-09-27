(ns metabase.api.dashboard
  "/api/dashboard endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [metabase.events :as events]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [common :as common]
                             [dashboard :refer [Dashboard], :as dashboard]
                             [dashboard-card :refer [DashboardCard create-dashboard-card! update-dashboard-card! delete-dashboard-card!]])
            [metabase.models.revision :as revision]))

(defendpoint GET "/"
  "Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:

  *  `all` - Return all `Dashboards`.
  *  `mine` - Return `Dashboards` created by the current user."
  [f]
  {f FilterOptionAllOrMine}
  (-> (db/select Dashboard {:where (case (or f :all)
                                     :all  [:or [:= :creator_id *current-user-id*]
                                                [:> :public_perms common/perms-none]]
                                     :mine [:= :creator_id *current-user-id*])})
      (hydrate :creator :can_read :can_write)))

(defendpoint POST "/"
  "Create a new `Dashboard`."
  [:as {{:keys [name description parameters public_perms], :as dashboard} :body}]
  {name         [Required NonEmptyString]
   public_perms [Required PublicPerms]
   parameters   [ArrayOfMaps]}
  (dashboard/create-dashboard! dashboard *current-user-id*))

(defendpoint GET "/:id"
  "Get `Dashboard` with ID."
  [id]
  (let-404 [dash (Dashboard id)]
    (read-check dash)
    (->500 dash
           (hydrate :creator [:ordered_cards [:card :creator] :series] :can_read :can_write)
           (assoc :actor_id *current-user-id*)
           (->> (events/publish-event :dashboard-read))
           (dissoc :actor_id))))

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
  (write-check Dashboard id)
  ;; TODO - it would be much more natural if `cascade-delete` returned the deleted entity instead of an api response
  (let [dashboard (Dashboard id)
        result    (db/cascade-delete! Dashboard :id id)]
    (events/publish-event :dashboard-delete (assoc dashboard :actor_id *current-user-id*))
    result))

(defendpoint POST "/:id/cards"
  "Add a `Card` to a `Dashboard`."
  [id :as {{:keys [cardId parameter_mappings series] :as dashboard-card} :body}]
  {cardId             [Required Integer]
   parameter_mappings [ArrayOfMaps]}
  (write-check Dashboard id)
  (check-400 (db/exists? Card :id cardId))
  (let [defaults       {:dashboard_id id
                        :card_id      cardId
                        :creator_id   *current-user-id*
                        :series       (or series [])}
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
    (doseq [{dashcard-id :id :as dashboard-card} cards]
      ;; ensure the dashcard we are updating is part of the given dashboard
      (when (contains? dashcard-ids dashcard-id)
        (update-dashboard-card! (update dashboard-card :series #(filter identity (map :id %)))))))
  (events/publish-event :dashboard-reposition-cards {:id id :actor_id *current-user-id* :dashcards cards})
  {:status :ok})

(defendpoint DELETE "/:id/cards"
  "Remove a `DashboardCard` from a `Dashboard`."
  [id dashcardId]
  {dashcardId [Required String->Integer]}
  (check-404 (db/exists? Dashboard :id id))
  (write-check Dashboard id)
  (when-let [dashboard-card (DashboardCard dashcardId)]
    (check-500 (delete-dashboard-card! dashboard-card *current-user-id*))
    {:success true}))

(defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Dashboard` with ID."
  [id]
  (check-404 (db/exists? Dashboard :id id))
  (revision/revisions+details Dashboard id))


(defendpoint POST "/:id/revert"
  "Revert a `Dashboard` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id [Required Integer]}
  (check-404 (db/exists? Dashboard :id id))
  (write-check Dashboard id)
  (revision/revert!
    :entity      Dashboard
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))

(define-routes)
