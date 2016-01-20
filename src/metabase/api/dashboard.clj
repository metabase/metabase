(ns metabase.api.dashboard
  "/api/dashboard endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [korma.core :as k]
            [metabase.events :as events]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [common :as common]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]])))

(defendpoint GET "/"
  "Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:

  *  `all` - Return all `Dashboards`.
  *  `mine` - Return `Dashboards` created by the current user."
  [f]
  {f FilterOptionAllOrMine}
  (-> (case (or f :all)
        :all  (sel :many Dashboard (k/where (or {:creator_id *current-user-id*}
                                                {:public_perms [> common/perms-none]})))
        :mine (sel :many Dashboard :creator_id *current-user-id*))
      (hydrate :creator :can_read :can_write)))

(defendpoint POST "/"
  "Create a new `Dashboard`."
  [:as {{:keys [name description public_perms] :as body} :body}]
  {name         [Required NonEmptyString]
   public_perms [Required PublicPerms]}
  (->> (ins Dashboard
            :name name
            :description description
            :public_perms public_perms
            :creator_id *current-user-id*)
       (events/publish-event :dashboard-create)))

(defendpoint GET "/:id"
  "Get `Dashboard` with ID."
  [id]
  (let-404 [db (-> (Dashboard id)
                   read-check
                   (hydrate :creator [:ordered_cards [:card :creator]] :can_read :can_write)
                   (assoc :actor_id *current-user-id*)
                   (->> (events/publish-event :dashboard-read))
                   (dissoc :actor_id))]
    {:dashboard db})) ; why is this returned with this {:dashboard} wrapper?

(defendpoint PUT "/:id"
  "Update a `Dashboard`."
  [id :as {{:keys [description name public_perms]} :body}]
  {name NonEmptyString, public_perms PublicPerms}
  (write-check Dashboard id)
  (check-500 (upd-non-nil-keys Dashboard id
                               :description description
                               :name name
                               :public_perms public_perms))
  (events/publish-event :dashboard-update {:id id :actor_id *current-user-id*}))

(defendpoint DELETE "/:id"
  "Delete a `Dashboard`."
  [id]
  (write-check Dashboard id)
  ;; TODO - it would be much more natural if `cascade-delete` returned the deleted entity instead of an api response
  (let [dashboard (sel :one Dashboard :id id)
        result (cascade-delete Dashboard :id id)]
    (events/publish-event :dashboard-delete (assoc dashboard :actor_id *current-user-id*))
    result))

(defendpoint POST "/:id/cards"
  "Add a `Card` to a `Dashboard`."
  [id :as {{:keys [cardId]} :body}]
  {cardId [Required Integer]}
  (write-check Dashboard id)
  (check-400 (exists? Card :id cardId))
  (let [result (ins DashboardCard :card_id cardId, :dashboard_id id)]
    (events/publish-event :dashboard-add-cards {:id id :actor_id *current-user-id* :dashcards [result]})
    result))

(defendpoint DELETE "/:id/cards"
  "Remove a `DashboardCard` from a `Dashboard`."
  [id dashcardId]
  {dashcardId [Required String->Integer]}
  (write-check Dashboard id)
  ;; TODO - it would be nicer to do this if `del` returned the object that was deleted instead of an api response
  (let [dashcard (sel :one DashboardCard :id dashcardId)
        result (del DashboardCard :id dashcardId :dashboard_id id)]
    (events/publish-event :dashboard-remove-cards {:id id :actor_id *current-user-id* :dashcards [dashcard]})
    result))

(defendpoint POST "/:id/reposition"
  "Reposition `Cards` on a `Dashboard`. Request body should have the form:

    {:cards [{:id ...
              :sizeX ...
              :sizeY ...
              :row ...
              :col} ...]}"
  [id :as {{:keys [cards]} :body}]
  (write-check Dashboard id)
  (doseq [{dashcard-id :id :keys [sizeX sizeY row col]} cards]
    ;; we lookup the dashcard purely to ensure the card is part of the given dashboard
    (let [dashcard (sel :one [DashboardCard :id] :id dashcard-id :dashboard_id id)]
      (when dashcard
        (upd DashboardCard dashcard-id :sizeX sizeX :sizeY sizeY :row row :col col))))
  (events/publish-event :dashboard-reposition-cards {:id id :actor_id *current-user-id* :dashcards cards})
  {:status :ok})

(define-routes)
