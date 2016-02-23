(ns metabase.api.dashboard
  "/api/dashboard endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [korma.core :as k]
            [metabase.events :as events]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [common :as common]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard create-dashboard-card update-dashboard-card delete-dashboard-card]])
            [metabase.models.revision :as revision]))

(defendpoint GET "/"
  "Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:

  *  `all` - Return all `Dashboards`.
  *  `mine` - Return `Dashboards` created by the current user."
  [f]
  {f FilterOptionAllOrMine}
  (-> (case (or f :all)
        :all  (db/sel :many Dashboard (k/where (or {:creator_id *current-user-id*}
                                                {:public_perms [> common/perms-none]})))
        :mine (db/sel :many Dashboard :creator_id *current-user-id*))
      (hydrate :creator :can_read :can_write)))

(defendpoint POST "/"
  "Create a new `Dashboard`."
  [:as {{:keys [name description public_perms] :as body} :body}]
  {name         [Required NonEmptyString]
   public_perms [Required PublicPerms]}
  (->> (db/ins Dashboard
               :name name
               :description description
               :public_perms public_perms
               :creator_id *current-user-id*)
       (events/publish-event :dashboard-create)))

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
  [id :as {{:keys [description name public_perms]} :body}]
  {name NonEmptyString, public_perms PublicPerms}
  (write-check Dashboard id)
  (check-500 (db/upd-non-nil-keys Dashboard id
                                  :description description
                                  :name name))
  (events/publish-event :dashboard-update (assoc (db/sel :one Dashboard :id id) :actor_id *current-user-id*)))

(defendpoint DELETE "/:id"
  "Delete a `Dashboard`."
  [id]
  (write-check Dashboard id)
  ;; TODO - it would be much more natural if `cascade-delete` returned the deleted entity instead of an api response
  (let [dashboard (db/sel :one Dashboard :id id)
        result    (db/cascade-delete Dashboard :id id)]
    (events/publish-event :dashboard-delete (assoc dashboard :actor_id *current-user-id*))
    result))

(defendpoint POST "/:id/cards"
  "Add a `Card` to a `Dashboard`."
  [id :as {{:keys [cardId series] :as dashboard-card} :body}]
  {cardId [Required Integer]}
  (write-check Dashboard id)
  (check-400 (db/exists? Card :id cardId))
  (let [defaults       {:dashboard_id id
                        :card_id      cardId
                        :creator_id   *current-user-id*
                        :series       (or series [])}
        dashboard-card (-> (merge dashboard-card defaults)
                           (update :series #(filter identity (map :id %))))]
    (let-500 [result (create-dashboard-card dashboard-card)]
      (events/publish-event :dashboard-add-cards {:id id :actor_id *current-user-id* :dashcards [result]})
      result)))

(defendpoint PUT "/:id/cards"
  "Reposition `Cards` on a `Dashboard`. Request body should have the form:

    {:cards [{:id ...
              :sizeX ...
              :sizeY ...
              :row ...
              :col ...
              :series [{:id 123
                        ...}]} ...]}"
  [id :as {{:keys [cards]} :body}]
  (write-check Dashboard id)
  (let [dashcard-ids (set (db/sel :many :field [DashboardCard :id] :dashboard_id id))]
    (doseq [{dashcard-id :id :as dashboard-card} cards]
      ;; ensure the dashcard we are updating is part of the given dashboard
      (when (contains? dashcard-ids dashcard-id)
        (update-dashboard-card (update dashboard-card :series #(filter identity (map :id %)))))))
  (events/publish-event :dashboard-reposition-cards {:id id :actor_id *current-user-id* :dashcards cards})
  {:status :ok})

(defendpoint DELETE "/:id/cards"
  "Remove a `DashboardCard` from a `Dashboard`."
  [id dashcardId]
  {dashcardId [Required String->Integer]}
  (let-404 [dashboard (Dashboard id)]
    (write-check Dashboard id)
    (when-let [dashboard-card (DashboardCard dashcardId)]
      (check-500 (delete-dashboard-card dashboard-card *current-user-id*))
      {:success true})))

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
  (revision/revert
    :entity      Dashboard
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))

(define-routes)
