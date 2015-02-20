(ns metabase.api.dash
  "/api/meta/dash endpoints."
  (:require [compojure.core :refer [GET POST DELETE]]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]])))

(defendpoint GET "/" [org f]
  (-> (case (or (keyword f) :all) ; default value for f is `all`
        :all (sel :many Dashboard :organization_id org)
        :mine (sel :many Dashboard :organization_id org :creator_id *current-user-id*))
      (hydrate :creator :organization)))

(defendpoint POST "/" [:as {:keys [body]}]
  (let [{:keys [organization]} body]
    (check-403 (org-perms-case organization ; check that current-user can make a Dashboard for this org
                 :admin true
                 :default true
                 nil false))
    (->> (-> body
             (select-keys [:organization :name :public_perms])
             (clojure.set/rename-keys {:organization :organization_id})
             (assoc :creator_id *current-user-id*))
         (medley/mapply ins Dashboard))))

(defendpoint GET "/:id" [id]
  (let-404 [db (-> (sel :one Dashboard :id id)
                   (hydrate :creator :organization [:ordered_cards [:card :creator]] :can_read :can_write))]
    {:dashboard db})) ; why is this returned with this {:dashboard} wrapper?

(defendpoint DELETE "/:id" [id]
  (let-404 [{:keys [can_write]} (sel :one Dashboard :id id)]
    (check-403 @can_write)
    (del Dashboard :id id)))

(defendpoint POST "/:id/cards" [id :as {{:keys [cardId]} :body}]
  (let-404 [{:keys [can_write]} (sel :one Dashboard :id id)]
    (check-403 @can_write))
  (check (exists? Card :id cardId) 400 (format "Card %d doesn't exist." cardId))
  (ins DashboardCard :card_id cardId :dashboard_id id))

(defendpoint DELETE "/:id/cards" [id dashcardId]
  (let-404 [{:keys [can_write]} (sel :one Dashboard :id id)]
    (check-403 @can_write))
  (del DashboardCard :id dashcardId :dashboard_id id))

(defendpoint POST "/:id/reposition" [id :as {{:keys [cards]} :body}]
  (let-404 [{:keys [can_write]} (sel :one Dashboard :id id)]
    (check-403 @can_write))
  (dorun (map (fn [{:keys [card_id sizeX sizeY row col]}]
                (let [{dashcard-id :id} (sel :one [DashboardCard :id] :card_id card_id :dashboard_id id)]
                  (upd DashboardCard dashcard-id :sizeX sizeX :sizeY sizeY :row row :col col)))
              cards))
  {:status :ok})

(define-routes)
