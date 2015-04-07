(ns metabase.api.dash
  "/api/dash endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [korma.core :refer :all]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [common :as common]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [org :refer [Org]])
            [metabase.util :as u]))

(defendpoint GET "/"
  "Get `Dashboards` for an `Org`. With filter option `f` (default `all`), restrict results as follows:

  *  `all` - Return all `Dashboards` for `Org`.
  *  `mine` - Return `Dashboards` created by the current user for `Org`."
  [org f]
  {org Required, f FilterOptionAllOrMine}
  (read-check Org org)
  (-> (case (or f :all)
        :all  (sel :many Dashboard :organization_id org (where (or {:creator_id *current-user-id*}
                                                                   {:public_perms [> common/perms-none]})))
        :mine (sel :many Dashboard :organization_id org :creator_id *current-user-id*))
      (hydrate :creator :organization)))

(defendpoint POST "/"
  "Create a new `Dashboard`."
  [:as {{:keys [organization name public_perms] :as body} :body}]
  {name         Required
   organization Required
   public_perms [Required PublicPerms]}
  (read-check Org organization) ; any user who has permissions for this Org can make a dashboard
  (ins Dashboard
    :organization_id organization
    :name name
    :public_perms public_perms
    :creator_id *current-user-id*))

(defendpoint GET "/:id"
  "Get `Dashboard` with ID."
  [id]
  (let-404 [db (-> (sel :one Dashboard :id id)
                   read-check
                   (hydrate :creator :organization [:ordered_cards [:card :creator]] :can_read :can_write))]
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
  (sel :one Dashboard :id id))

(defendpoint DELETE "/:id"
  "Delete a `Dashboard`."
  [id]
  (write-check Dashboard id)
  (del Dashboard :id id))

(defendpoint POST "/:id/cards"
  "Add a `Card` to a `Dashboard`."
  [id :as {{:keys [cardId]} :body}]
  {cardId [Required Integer]}
  (write-check Dashboard id)
  (check-400 (exists? Card :id cardId))
  (ins DashboardCard :card_id cardId :dashboard_id id))

(defendpoint DELETE "/:id/cards"
  "Remove a `Card` from a `Dashboard`."
  [id dashcardId]
  {dashcardId [Required String->Integer]}
  (write-check Dashboard id)
  (del DashboardCard :id dashcardId :dashboard_id id))

(defendpoint POST "/:id/reposition"
  "Reposition `Cards` on a `Dashboard`. Request body should have the form:

    {:cards [{:card_id ...
              :sizeX ...
              :sizeY ...
              :row ...
              :col} ...]}"
  [id :as {{:keys [cards]} :body}]
  (write-check Dashboard id)
  (dorun (map (fn [{:keys [card_id sizeX sizeY row col]}]
                (let [{dashcard-id :id} (sel :one [DashboardCard :id] :card_id card_id :dashboard_id id)]
                  (upd DashboardCard dashcard-id :sizeX sizeX :sizeY sizeY :row row :col col)))
              cards))
  {:status :ok})

(define-routes)
