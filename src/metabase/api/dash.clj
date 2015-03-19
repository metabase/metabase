(ns metabase.api.dash
  "/api/meta/dash endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [org :refer [Org]])
            [metabase.util :as u]))

(defannotation DashFilterOption [symb value :nillable]
  (checkp-contains? #{:all :mine} symb (keyword value)))

(defendpoint GET "/" [org f]
  {org Required, f DashFilterOption}
  (read-check Org org)
  (-> (case (or f :all) ; default value for f is `all`
        :all  (sel :many Dashboard :organization_id org)
        :mine (sel :many Dashboard :organization_id org :creator_id *current-user-id*))
      (hydrate :creator :organization)))

(defendpoint POST "/" [:as {{:keys [organization name public_perms] :as body} :body}]
  {name         Required
   organization Required
   public_perms Required}
  (read-check Org organization) ; any user who has permissions for this Org can make a dashboard
  (ins Dashboard
    :organization_id organization
    :name name
    :public_perms public_perms
    :creator_id *current-user-id*))

(defendpoint GET "/:id" [id]
  (let-404 [db (-> (sel :one Dashboard :id id)
                   (hydrate :creator :organization [:ordered_cards [:card :creator]] :can_read :can_write))]
    {:dashboard db})) ; why is this returned with this {:dashboard} wrapper?

(defendpoint PUT "/:id" [id :as {{:keys [description name public_perms]} :body}]
  {name         NonEmptyString
   public_perms PublicPerms}
  (write-check Dashboard id)
  (check-500 (upd-non-nil-keys Dashboard id
                               :description description
                               :name name
                               :public_perms public_perms))
  (sel :one Dashboard :id id))

(defendpoint DELETE "/:id" [id]
  (write-check Dashboard id)
  (del Dashboard :id id))

(defendpoint POST "/:id/cards" [id :as {{:keys [cardId]} :body}]
  {cardId [Required IsInteger]}
  (write-check Dashboard id)
  (check-400 (exists? Card :id cardId))
  (ins DashboardCard :card_id cardId :dashboard_id id))

(defendpoint DELETE "/:id/cards" [id dashcardId]
  {dashcardId [Required String->Integer]}
  (write-check Dashboard id)
  (del DashboardCard :id dashcardId :dashboard_id id))

(defendpoint POST "/:id/reposition" [id :as {{:keys [cards]} :body}]
  (write-check Dashboard id)
  (dorun (map (fn [{:keys [card_id sizeX sizeY row col]}]
                (let [{dashcard-id :id} (sel :one [DashboardCard :id] :card_id card_id :dashboard_id id)]
                  (upd DashboardCard dashcard-id :sizeX sizeX :sizeY sizeY :row row :col col)))
              cards))
  {:status :ok})

(define-routes)
