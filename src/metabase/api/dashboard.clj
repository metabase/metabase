(ns metabase.api.dashboard
  "/api/dashboard endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.automagic-dashboards.populate :as magic.populate]
            [metabase
             [events :as events]
             [query-processor :as qp]
             [related :as related]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection]
             [dashboard :as dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard delete-dashboard-card!]]
             [dashboard-favorite :refer [DashboardFavorite]]
             [interface :as mi]
             [query :as query :refer [Query]]
             [revision :as revision]]
            [metabase.query-processor.util :as qp-util]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]])
  (:import java.util.UUID))

(defn- hydrate-favorites
  "Efficiently hydrate the `:favorite` status (whether the current User has favorited it) for a group of Dashboards."
  [dashboards]
  (let [favorite-dashboard-ids (when (seq dashboards)
                                 (db/select-field :dashboard_id DashboardFavorite
                                   :user_id      api/*current-user-id*
                                   :dashboard_id [:in (set (map u/get-id dashboards))]))]
    (for [dashboard dashboards]
      (assoc dashboard
        :favorite (contains? favorite-dashboard-ids (u/get-id dashboard))))))

(defn- dashboards-list [filter-option]
  (as-> (db/select Dashboard {:where    [:and (case (or (keyword filter-option) :all)
                                                (:all :archived)  true
                                                :mine [:= :creator_id api/*current-user-id*])
                                              [:= :archived (= (keyword filter-option) :archived)]]
                              :order-by [:%lower.name]}) <>
    (hydrate <> :creator)
    (filter mi/can-read? <>)
    (hydrate-favorites <>)))

(api/defendpoint GET "/"
  "Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:

  *  `all`      - Return all Dashboards.
  *  `mine`     - Return Dashboards created by the current user.
  *  `archived` - Return Dashboards that have been archived. (By default, these are *excluded*.)"
  [f]
  {f (s/maybe (s/enum "all" "mine" "archived"))}
  (dashboards-list f))


(api/defendpoint POST "/"
  "Create a new `Dashboard`."
  [:as {{:keys [name description parameters collection_id collection_position], :as dashboard} :body}]
  {name                su/NonBlankString
   parameters          [su/Map]
   description         (s/maybe s/Str)
   collection_id       (s/maybe su/IntGreaterThanZero)
   collection_position (s/maybe su/IntGreaterThanZero)}
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (collection/check-write-perms-for-collection collection_id)
  (let [dashboard-data {:name                name
                        :description         description
                        :parameters          (or parameters [])
                        :creator_id          api/*current-user-id*
                        :collection_id       collection_id
                        :collection_position collection_position}]
    (db/transaction
      ;; Adding a new dashboard at `collection_position` could cause other dashboards in this collection to change
      ;; position, check that and fix up if needed
      (api/maybe-reconcile-collection-position! dashboard-data)
      ;; Ok, now save the Dashboard
      (->> (db/insert! Dashboard dashboard-data)
           ;; publish an event and return the newly created Dashboard
           (events/publish-event! :dashboard-create)))))


;;; -------------------------------------------- Hiding Unreadable Cards ---------------------------------------------

(defn- hide-unreadable-card
  "If CARD is unreadable, replace it with an object containing only its `:id`."
  [card]
  (when card
    (if (mi/can-read? card)
      card
      (select-keys card [:id]))))

(defn- hide-unreadable-cards
  "Replace the `:card` and `:series` entries from dashcards that they user isn't allowed to read with empty objects."
  [{public-uuid :public_uuid, :as dashboard}]
  (update dashboard :ordered_cards (fn [dashcards]
                                     (vec (for [dashcard dashcards]
                                            (-> dashcard
                                                (update :card hide-unreadable-card)
                                                (update :series (partial mapv hide-unreadable-card))))))))


;;; ------------------------------------------ Query Average Duration Info -------------------------------------------

;; Adding the average execution time to all of the Cards in a Dashboard efficiently is somewhat involved. There are a
;; few things that make this tricky:
;;
;; 1. Queries are usually executed with `:constraints` that different from how they're actually definied, but not
;;    always. This means we should look up hashes for both the query as-is and for the query with
;;    `default-query-constraints` and use whichever one we find
;;
;; 2. The structure of DashCards themselves is complicated. It has a top-level `:card` property and (optionally) a
;;    sequence of additional Cards under `:series`
;;
;; 3. Query hashes are byte arrays, and two idential byte arrays aren't equal to each other in Java; thus they don't
;;    work as one would expect when being used as map keys
;;
;; Here's an overview of the approach used to efficiently add the info:
;;
;; 1. Build a sequence of query hashes (both as-is and with default constraints) for every card and series in the
;;    dashboard cards
;;
;; 2. Fetch all matching entires from Query in the DB and build a map of hash (converted to a Clojure vector) ->
;;    average execution time
;;
;; 3. Iterate back over each card and look for matching entries in the `hash-vec->avg-time` for either the normal hash
;;    or the hash with default constraints, and add the result as `:average_execution_time`

(defn- card->query-hashes
  "Return a tuple of possible hashes that would be associated with executions of CARD. The first is the hash of the
  query dictionary as-is; the second is one with the `default-query-constraints`, which is how it will most likely be
  run."
  [{:keys [dataset_query]}]
  (u/ignore-exceptions
    [(qp-util/query-hash dataset_query)
     (qp-util/query-hash (assoc dataset_query :constraints qp/default-query-constraints))]))

(defn- dashcard->query-hashes
  "Return a sequence of all the query hashes for this DASHCARD, including the top-level Card and any Series."
  [{:keys [card series]}]
  (reduce concat
          (card->query-hashes card)
          (for [card series]
            (card->query-hashes card))))

(defn- dashcards->query-hashes
  "Return a sequence of all the query hashes used in a DASHCARDS."
  [dashcards]
  (apply concat (for [dashcard dashcards]
                  (dashcard->query-hashes dashcard))))

(defn- hashes->hash-vec->avg-time
  "Given some query HASHES, return a map of hashes (as normal Clojure vectors) to the average query durations.
  (The hashes are represented as normal Clojure vectors because identical byte arrays aren't considered equal to one
  another, and thus do not work as one would expect when used as map keys.)"
  [hashes]
  (when (seq hashes)
    (into {} (for [[k v] (db/select-field->field :query_hash :average_execution_time Query :query_hash [:in hashes])]
               {(vec k) v}))))

(defn- add-query-average-duration-to-card
  "Add `:query_average_duration` info to a CARD (i.e., the `:card` property of a DashCard or an entry in its `:series`
  array)."
  [card hash-vec->avg-time]
  (assoc card :query_average_duration (some (fn [query-hash]
                                              (hash-vec->avg-time (vec query-hash)))
                                            (card->query-hashes card))))

(defn- add-query-average-duration-to-dashcards
  "Add `:query_average_duration` to the top-level Card and any Series in a sequence of DASHCARDS."
  ([dashcards]
   (add-query-average-duration-to-dashcards dashcards (hashes->hash-vec->avg-time (dashcards->query-hashes dashcards))))
  ([dashcards hash-vec->avg-time]
   (for [dashcard dashcards]
     (-> dashcard
         (update :card   add-query-average-duration-to-card hash-vec->avg-time)
         (update :series (fn [series]
                           (for [card series]
                             (add-query-average-duration-to-card card hash-vec->avg-time))))))))

(defn add-query-average-durations
  "Add a `average_execution_time` field to each card (and series) belonging to DASHBOARD."
  [dashboard]
  (update dashboard :ordered_cards add-query-average-duration-to-dashcards))


(defn- get-dashboard
  "Get `Dashboard` with ID."
  [id]
  (-> (Dashboard id)
      api/check-404
      (hydrate [:ordered_cards :card :series] :can_write)
      api/read-check
      api/check-not-archived
      hide-unreadable-cards
      add-query-average-durations))


(api/defendpoint POST "/:from-dashboard-id/copy"
  "Copy a `Dashboard`."
  [from-dashboard-id :as {{:keys [name description collection_id collection_position], :as dashboard} :body}]
  {name                (s/maybe su/NonBlankString)
   description         (s/maybe s/Str)
   collection_id       (s/maybe su/IntGreaterThanZero)
   collection_position (s/maybe su/IntGreaterThanZero)}
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (collection/check-write-perms-for-collection collection_id)
  (let [existing-dashboard (get-dashboard from-dashboard-id)
        dashboard-data {:name                (or name (:name existing-dashboard))
                        :description         (or description (:description existing-dashboard))
                        :parameters          (or (:parameters existing-dashboard) [])
                        :creator_id          api/*current-user-id*
                        :collection_id       collection_id
                        :collection_position collection_position}
        dashboard      (db/transaction
                            ;; Adding a new dashboard at `collection_position` could cause other dashboards in this collection to change
                            ;; position, check that and fix up if needed
                            (api/maybe-reconcile-collection-position! dashboard-data)
                            ;; Ok, now save the Dashboard
                            (u/prog1 (db/insert! Dashboard dashboard-data)
                                    ;; Get cards from existing dashboard and associate to copied dashboard
                                    (doseq [card (:ordered_cards existing-dashboard)]
                                      (api/check-500 (dashboard/add-dashcard! <> (:card_id card) card)))))]
    (events/publish-event! :dashboard-create dashboard)))


;;; --------------------------------------------- Fetching/Updating/Etc. ---------------------------------------------

(api/defendpoint GET "/:id"
  "Get `Dashboard` with ID."
  [id]
  (u/prog1 (-> (Dashboard id)
               api/check-404
               (hydrate [:ordered_cards :card :series] :can_write)
               api/read-check
               api/check-not-archived
               hide-unreadable-cards
               add-query-average-durations)
    (events/publish-event! :dashboard-read (assoc <> :actor_id api/*current-user-id*))))


(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding` or `embedding_params`. Embedding must be
  enabled."
  [dash-before-update dash-updates]
  (when (or (api/column-will-change? :enable_embedding dash-before-update dash-updates)
            (api/column-will-change? :embedding_params dash-before-update dash-updates))
    (api/check-embedding-enabled)
    (api/check-superuser)))

(api/defendpoint PUT "/:id"
  "Update a `Dashboard`.

  Usually, you just need write permissions for this Dashboard to do this (which means you have appropriate
  permissions for the Cards belonging to this Dashboard), but to change the value of `enable_embedding` you must be a
  superuser."
  [id :as {{:keys [description name parameters caveats points_of_interest show_in_getting_started enable_embedding
                   embedding_params position archived collection_id collection_position]
            :as dash-updates} :body}]
  {name                    (s/maybe su/NonBlankString)
   description             (s/maybe s/Str)
   caveats                 (s/maybe s/Str)
   points_of_interest      (s/maybe s/Str)
   show_in_getting_started (s/maybe s/Bool)
   enable_embedding        (s/maybe s/Bool)
   embedding_params        (s/maybe su/EmbeddingParams)
   parameters              (s/maybe [su/Map])
   position                (s/maybe su/IntGreaterThanZero)
   archived                (s/maybe s/Bool)
   collection_id           (s/maybe su/IntGreaterThanZero)
   collection_position     (s/maybe su/IntGreaterThanZero)}
  (let [dash-before-update (api/write-check Dashboard id)]
    ;; Do various permissions checks as needed
    (collection/check-allowed-to-change-collection dash-before-update dash-updates)
    (check-allowed-to-change-embedding dash-before-update dash-updates)
    (api/check-500
     (db/transaction

       ;;If the dashboard has an updated position, or if the dashboard is moving to a new collection, we might need to
       ;;adjust the collection position of other dashboards in the collection
       (api/maybe-reconcile-collection-position! dash-before-update dash-updates)

       (db/update! Dashboard id
         ;; description, position, collection_id, and collection_position are allowed to be `nil`. Everything else must be
         ;; non-nil
         (u/select-keys-when dash-updates
           :present #{:description :position :collection_id :collection_position}
           :non-nil #{:name :parameters :caveats :points_of_interest :show_in_getting_started :enable_embedding
                      :embedding_params :archived})))))
  ;; now publish an event and return the updated Dashboard
  (u/prog1 (Dashboard id)
    (events/publish-event! :dashboard-update (assoc <> :actor_id api/*current-user-id*))))


;; TODO - We can probably remove this in the near future since it should no longer be needed now that we're going to
;; be setting `:archived` to `true` via the `PUT` endpoint instead
(api/defendpoint DELETE "/:id"
  "Delete a `Dashboard`."
  [id]
  (log/warn (str "DELETE /api/dashboard/:id is deprecated. Instead of deleting a Dashboard, you should change its "
                 "`archived` value via PUT /api/dashboard/:id."))
  (let [dashboard (api/write-check Dashboard id)]
    (db/delete! Dashboard :id id)
    (events/publish-event! :dashboard-delete (assoc dashboard :actor_id api/*current-user-id*)))
  api/generic-204-no-content)


;; TODO - param should be `card_id`, not `cardId` (fix here + on frontend at the same time)
(api/defendpoint POST "/:id/cards"
  "Add a `Card` to a `Dashboard`."
  [id :as {{:keys [cardId parameter_mappings series], :as dashboard-card} :body}]
  {cardId             (s/maybe su/IntGreaterThanZero)
   parameter_mappings [su/Map]}
  (api/check-not-archived (api/write-check Dashboard id))
  (when cardId
    (api/check-not-archived (api/read-check Card cardId)))
  (u/prog1 (api/check-500 (dashboard/add-dashcard! id cardId (-> dashboard-card
                                                                 (assoc :creator_id api/*current-user*)
                                                                 (dissoc :cardId))))
    (events/publish-event! :dashboard-add-cards {:id id, :actor_id api/*current-user-id*, :dashcards [<>]})))


;; TODO - we should use schema to validate the format of the Cards :D
(api/defendpoint PUT "/:id/cards"
  "Update `Cards` on a `Dashboard`. Request body should have the form:

    {:cards [{:id     ...
              :sizeX  ...
              :sizeY  ...
              :row    ...
              :col    ...
              :series [{:id 123
                        ...}]} ...]}"
  [id :as {{:keys [cards]} :body}]
  (api/check-not-archived (api/write-check Dashboard id))
  (dashboard/update-dashcards! id cards)
  (events/publish-event! :dashboard-reposition-cards {:id id, :actor_id api/*current-user-id*, :dashcards cards})
  {:status :ok})


(api/defendpoint DELETE "/:id/cards"
  "Remove a `DashboardCard` from a `Dashboard`."
  [id dashcardId]
  {dashcardId su/IntStringGreaterThanZero}
  (api/check-not-archived (api/write-check Dashboard id))
  (when-let [dashboard-card (DashboardCard (Integer/parseInt dashcardId))]
    (api/check-500 (delete-dashboard-card! dashboard-card api/*current-user-id*))
    {:success true})) ; TODO - why doesn't this return a 204 'No Content' response?


(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Dashboard` with ID."
  [id]
  (api/read-check Dashboard id)
  (revision/revisions+details Dashboard id))


(api/defendpoint POST "/:id/revert"
  "Revert a `Dashboard` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id su/IntGreaterThanZero}
  (api/write-check Dashboard id)
  (revision/revert!
    :entity      Dashboard
    :id          id
    :user-id     api/*current-user-id*
    :revision-id revision_id))


;;; --------------------------------------------------- Favoriting ---------------------------------------------------

(api/defendpoint POST "/:id/favorite"
  "Favorite a Dashboard."
  [id]
  (api/check-not-archived (api/read-check Dashboard id))
  (db/insert! DashboardFavorite :dashboard_id id, :user_id api/*current-user-id*))


(api/defendpoint DELETE "/:id/favorite"
  "Unfavorite a Dashboard."
  [id]
  (api/check-not-archived (api/read-check Dashboard id))
  (api/let-404 [favorite-id (db/select-one-id DashboardFavorite :dashboard_id id, :user_id api/*current-user-id*)]
    (db/delete! DashboardFavorite, :id favorite-id))
  api/generic-204-no-content)


;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api/defendpoint POST "/:dashboard-id/public_link"
  "Generate publicly-accessible links for this Dashboard. Returns UUID to be used in public links. (If this
  Dashboard has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [dashboard-id]
  (api/check-superuser)
  (api/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check Dashboard dashboard-id))
  {:uuid (or (db/select-one-field :public_uuid Dashboard :id dashboard-id)
             (u/prog1 (str (UUID/randomUUID))
               (db/update! Dashboard dashboard-id
                 :public_uuid       <>
                 :made_public_by_id api/*current-user-id*)))})

(api/defendpoint DELETE "/:dashboard-id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [dashboard-id]
  (api/check-superuser)
  (api/check-public-sharing-enabled)
  (api/check-exists? Dashboard :id dashboard-id, :public_uuid [:not= nil], :archived false)
  (db/update! Dashboard dashboard-id
    :public_uuid       nil
    :made_public_by_id nil)
  {:status 204, :body nil})

(api/defendpoint GET "/public"
  "Fetch a list of Dashboards with public UUIDs. These dashboards are publicly-accessible *if* public sharing is
  enabled."
  []
  (api/check-superuser)
  (api/check-public-sharing-enabled)
  (db/select [Dashboard :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(api/defendpoint GET "/embeddable"
  "Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding
  endpoints and a signed JWT."
  []
  (api/check-superuser)
  (api/check-embedding-enabled)
  (db/select [Dashboard :name :id], :enable_embedding true, :archived false))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  (-> id Dashboard api/read-check related/related))

;;; ---------------------------------------------- Transient dashboards ----------------------------------------------

(api/defendpoint POST "/save/collection/:parent-collection-id"
  "Save a denormalized description of dashboard into collection with ID `:parent-collection-id`."
  [parent-collection-id :as {dashboard :body}]
  (collection/check-write-perms-for-collection parent-collection-id)
  (->> (dashboard/save-transient-dashboard! dashboard parent-collection-id)
       (events/publish-event! :dashboard-create)))

(api/defendpoint POST "/save"
  "Save a denormalized description of dashboard."
  [:as {dashboard :body}]
  (let [parent-collection-id (if api/*is-superuser?*
                               (:id (magic.populate/get-or-create-root-container-collection))
                               (db/select-one-field :id 'Collection
                                 :personal_owner_id api/*current-user-id*))]
    (->> (dashboard/save-transient-dashboard! dashboard parent-collection-id)
         (events/publish-event! :dashboard-create))))


(api/define-routes)
