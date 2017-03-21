(ns metabase.api.dashboard
  "/api/dashboard endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [schema.core :as s]
            [metabase.events :as events]
            [metabase.api.common :refer :all]
            (toucan [db :as db]
                    [hydrate :refer [hydrate]])
            (metabase.models [card :refer [Card]]
                             [common :as common]
                             [dashboard :refer [Dashboard], :as dashboard]
                             [dashboard-card :refer [DashboardCard create-dashboard-card! update-dashboard-card! delete-dashboard-card!]]
                             [interface :as mi]
                             [revision :as revision])
            [metabase.util :as u]
            [metabase.util.schema :as su])
  (:import java.util.UUID))


(defn- dashboards-list [filter-option]
  (filter mi/can-read? (-> (db/select Dashboard {:where    (case (or (keyword filter-option) :all)
                                                                 :all  true
                                                                 :mine [:= :creator_id *current-user-id*])
                                                     :order-by [:%lower.name]})
                               (hydrate :creator))))

(defendpoint GET "/"
  "Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:

  *  `all` - Return all `Dashboards`.
  *  `mine` - Return `Dashboards` created by the current user."
  [f]
  {f (s/maybe (s/enum "all" "mine"))}
  (dashboards-list f))


(defendpoint POST "/"
  "Create a new `Dashboard`."
  [:as {{:keys [name parameters], :as dashboard} :body}]
  {name       su/NonBlankString
   parameters [su/Map]}
  (dashboard/create-dashboard! dashboard *current-user-id*))

(defn- hide-unreadable-card
  "If CARD is unreadable, replace it with an object containing only its `:id`."
  [card]
  (if (mi/can-read? card)
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
    (events/publish-event! :dashboard-read (assoc <> :actor_id *current-user-id*))))


(defendpoint PUT "/:id"
  "Update a `Dashboard`.

   Usually, you just need write permissions for this Dashboard to do this (which means you have appropriate permissions for the Cards belonging to this Dashboard),
   but to change the value of `enable_embedding` you must be a superuser."
  [id :as {{:keys [description name parameters caveats points_of_interest show_in_getting_started enable_embedding embedding_params], :as dashboard} :body}]
  {name                    (s/maybe su/NonBlankString)
   description             (s/maybe su/NonBlankString)
   caveats                 (s/maybe su/NonBlankString)
   points_of_interest      (s/maybe su/NonBlankString)
   show_in_getting_started (s/maybe su/NonBlankString)
   enable_embedding        (s/maybe s/Bool)
   embedding_params        (s/maybe su/EmbeddingParams)
   parameters              (s/maybe [su/Map])}
  (let [dash (write-check Dashboard id)]
    ;; you must be a superuser to change the value of `enable_embedding` or `embedding_params`. Embedding must be enabled
    (when (or (and (not (nil? enable_embedding))
                   (not= enable_embedding (:enable_embedding dash)))
              (and embedding_params
                   (not= embedding_params (:embedding_params dash))))
      (check-embedding-enabled)
      (check-superuser)))
  (check-500 (-> (assoc dashboard :id id)
                 (dashboard/update-dashboard! *current-user-id*))))


(defendpoint DELETE "/:id"
  "Delete a `Dashboard`."
  [id]
  (let [dashboard (write-check Dashboard id)]
    (db/delete! Dashboard :id id)
    (events/publish-event! :dashboard-delete (assoc dashboard :actor_id *current-user-id*)))
  generic-204-no-content)


(defendpoint POST "/:id/cards"
  "Add a `Card` to a `Dashboard`."
  [id :as {{:keys [cardId parameter_mappings series] :as dashboard-card} :body}]
  {cardId             su/IntGreaterThanZero
   parameter_mappings [su/Map]}
  (write-check Dashboard id)
  (read-check Card cardId)
  (let [defaults       {:dashboard_id           id
                        :card_id                cardId
                        :visualization_settings {}
                        :creator_id             *current-user-id*
                        :series                 (or series [])}
        dashboard-card (-> (merge dashboard-card defaults)
                           (update :series #(filter identity (map :id %))))]
    (u/prog1 (check-500 (create-dashboard-card! dashboard-card))
      (events/publish-event! :dashboard-add-cards {:id id, :actor_id *current-user-id*, :dashcards [<>]}))))


;; TODO - we should use schema to validate the format of the Cards :D
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
  (events/publish-event! :dashboard-reposition-cards {:id id, :actor_id *current-user-id*, :dashcards cards})
  {:status :ok})


(defendpoint DELETE "/:id/cards"
  "Remove a `DashboardCard` from a `Dashboard`."
  [id dashcardId]
  {dashcardId su/IntStringGreaterThanZero}
  (write-check Dashboard id)
  (when-let [dashboard-card (DashboardCard (Integer/parseInt dashcardId))]
    (check-500 (delete-dashboard-card! dashboard-card *current-user-id*))
    {:success true})) ; TODO - why doesn't this return a 204 'No Content' response?


(defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Dashboard` with ID."
  [id]
  (read-check Dashboard id)
  (revision/revisions+details Dashboard id))


(defendpoint POST "/:id/revert"
  "Revert a `Dashboard` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id su/IntGreaterThanZero}
  (write-check Dashboard id)
  (revision/revert!
    :entity      Dashboard
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))


;;; ------------------------------------------------------------ Sharing is Caring ------------------------------------------------------------

(defendpoint POST "/:dashboard-id/public_link"
  "Generate publically-accessible links for this Dashboard. Returns UUID to be used in public links.
   (If this Dashboard has already been shared, it will return the existing public link rather than creating a new one.)
   Public sharing must be enabled."
  [dashboard-id]
  (check-superuser)
  (check-public-sharing-enabled)
  (read-check Dashboard dashboard-id)
  {:uuid (or (db/select-one-field :public_uuid Dashboard :id dashboard-id)
             (u/prog1 (str (UUID/randomUUID))
               (db/update! Dashboard dashboard-id
                 :public_uuid       <>
                 :made_public_by_id *current-user-id*)))})

(defendpoint DELETE "/:dashboard-id/public_link"
  "Delete the publically-accessible link to this Dashboard."
  [dashboard-id]
  (check-superuser)
  (check-public-sharing-enabled)
  (check-exists? Dashboard :id dashboard-id, :public_uuid [:not= nil])
  (db/update! Dashboard dashboard-id
    :public_uuid       nil
    :made_public_by_id nil)
  {:status 204, :body nil})

(defendpoint GET "/public"
  "Fetch a list of Dashboards with public UUIDs. These dashboards are publically-accessible *if* public sharing is enabled."
  []
  (check-superuser)
  (check-public-sharing-enabled)
  (db/select [Dashboard :name :id :public_uuid], :public_uuid [:not= nil]))

(defendpoint GET "/embeddable"
  "Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding endpoints and a signed JWT."
  []
  (check-superuser)
  (check-embedding-enabled)
  (db/select [Dashboard :name :id], :enable_embedding true))


(define-routes)
