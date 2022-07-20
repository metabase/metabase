(ns metabase.api.dashboard
  "/api/dashboard endpoints."
  (:require [cheshire.core :as json]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [medley.core :as m]
            [metabase.analytics.snowplow :as snowplow]
            [metabase.api.common :as api]
            [metabase.api.common.validation :as validation]
            [metabase.api.dataset :as api.dataset]
            [metabase.automagic-dashboards.populate :as populate]
            [metabase.events :as events]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :as collection]
            [metabase.models.dashboard :as dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :as dashboard-card :refer [DashboardCard]]
            [metabase.models.field :refer [Field]]
            [metabase.models.interface :as mi]
            [metabase.models.params :as params]
            [metabase.models.params.chain-filter :as chain-filter]
            [metabase.models.query :as query :refer [Query]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.models.revision :as revision]
            [metabase.models.revision.last-edit :as last-edit]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.dashboard :as qp.dashboard]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.middleware.constraints :as qp.constraints]
            [metabase.query-processor.pivot :as qp.pivot]
            [metabase.query-processor.util :as qp.util]
            [metabase.related :as related]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]])
  (:import java.util.UUID))

(defn- dashboards-list [filter-option]
  (as-> (db/select Dashboard {:where    [:and (case (or (keyword filter-option) :all)
                                                (:all :archived)  true
                                                :mine [:= :creator_id api/*current-user-id*])
                                              [:= :archived (= (keyword filter-option) :archived)]]
                              :order-by [:%lower.name]}) <>
    (hydrate <> :creator)
    (filter mi/can-read? <>)))

(api/defendpoint GET "/"
  "Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:

  *  `all`      - Return all Dashboards.
  *  `mine`     - Return Dashboards created by the current user.
  *  `archived` - Return Dashboards that have been archived. (By default, these are *excluded*.)"
  [f]
  {f (s/maybe (s/enum "all" "mine" "archived"))}
  (let [dashboards (dashboards-list f)
        edit-infos (:dashboard (last-edit/fetch-last-edited-info {:dashboard-ids (map :id dashboards)}))]
    (into []
          (map (fn [{:keys [id] :as dashboard}]
                 (if-let [edit-info (get edit-infos id)]
                   (assoc dashboard :last-edit-info edit-info)
                   dashboard)))
          dashboards)))

(api/defendpoint POST "/"
  "Create a new Dashboard."
  [:as {{:keys [name description parameters cache_ttl collection_id collection_position], :as _dashboard} :body}]
  {name                su/NonBlankString
   parameters          (s/maybe [su/Parameter])
   description         (s/maybe s/Str)
   cache_ttl           (s/maybe su/IntGreaterThanZero)
   collection_id       (s/maybe su/IntGreaterThanZero)
   collection_position (s/maybe su/IntGreaterThanZero)}
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (collection/check-write-perms-for-collection collection_id)
  (let [dashboard-data {:name                name
                        :description         description
                        :parameters          (or parameters [])
                        :creator_id          api/*current-user-id*
                        :cache_ttl           cache_ttl
                        :collection_id       collection_id
                        :collection_position collection_position}
        dash           (db/transaction
                        ;; Adding a new dashboard at `collection_position` could cause other dashboards in this collection to change
                        ;; position, check that and fix up if needed
                        (api/maybe-reconcile-collection-position! dashboard-data)
                        ;; Ok, now save the Dashboard
                        (db/insert! Dashboard dashboard-data))]
    (events/publish-event! :dashboard-create dash)
    (snowplow/track-event! ::snowplow/dashboard-created api/*current-user-id* {:dashboard-id (u/the-id dash)})
    (assoc dash :last-edit-info (last-edit/edit-information-for-user @api/*current-user*))))


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
  [dashboard]
  (update dashboard :ordered_cards (fn [dashcards]
                                     (vec (for [dashcard dashcards]
                                            (-> dashcard
                                                (update :card hide-unreadable-card)
                                                (update :series (partial mapv hide-unreadable-card))))))))


;;; ------------------------------------------ Query Average Duration Info -------------------------------------------

;; Adding the average execution time to all of the Cards in a Dashboard efficiently is somewhat involved. There are a
;; few things that make this tricky:
;;
;; 1. Queries are usually executed with `:constraints` that different from how they're actually defined, but not
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
;; 2. Fetch all matching entries from Query in the DB and build a map of hash (converted to a Clojure vector) ->
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
    [(qp.util/query-hash dataset_query)
     (qp.util/query-hash (assoc dataset_query :constraints (qp.constraints/default-query-constraints)))]))

(defn- dashcard->query-hashes
  "Return a sequence of all the query hashes for this `dashcard`, including the top-level Card and any Series."
  [{:keys [card series]}]
  (reduce concat
          (card->query-hashes card)
          (for [card series]
            (card->query-hashes card))))

(defn- dashcards->query-hashes
  "Return a sequence of all the query hashes used in a `dashcards`."
  [dashcards]
  (apply concat (for [dashcard dashcards]
                  (dashcard->query-hashes dashcard))))

(defn- hashes->hash-vec->avg-time
  "Given some query `hashes`, return a map of hashes (as normal Clojure vectors) to the average query durations.
  (The hashes are represented as normal Clojure vectors because identical byte arrays aren't considered equal to one
  another, and thus do not work as one would expect when used as map keys.)"
  [hashes]
  (when (seq hashes)
    (into {} (for [[k v] (db/select-field->field :query_hash :average_execution_time Query :query_hash [:in hashes])]
               {(vec k) v}))))

(defn- add-query-average-duration-to-card
  "Add `:query_average_duration` info to a `card` (i.e., the `:card` property of a DashCard or an entry in its `:series`
  array)."
  [card hash-vec->avg-time]
  (assoc card :query_average_duration (some (fn [query-hash]
                                              (hash-vec->avg-time (vec query-hash)))
                                            (card->query-hashes card))))

(defn- add-query-average-duration-to-dashcards
  "Add `:query_average_duration` to the top-level Card and any Series in a sequence of `dashcards`."
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
  "Add a `average_execution_time` field to each card (and series) belonging to `dashboard`."
  [dashboard]
  (update dashboard :ordered_cards add-query-average-duration-to-dashcards))

(defn- get-dashboard
  "Get Dashboard with ID."
  [id]
  (-> (Dashboard id)
      api/check-404
      ;; i'm a bit worried that this is an n+1 situation here. The cards can be batch hydrated i think because they
      ;; have a hydration key and an id. moderation_reviews currently aren't batch hydrated but i'm worried they
      ;; cannot be in this situation
      (hydrate [:ordered_cards [:card [:moderation_reviews :moderator_details]] :series] :collection_authority_level :can_write :param_fields)
      api/read-check
      api/check-not-archived
      hide-unreadable-cards
      add-query-average-durations))


(api/defendpoint POST "/:from-dashboard-id/copy"
  "Copy a Dashboard."
  [from-dashboard-id :as {{:keys [name description collection_id collection_position], :as _dashboard} :body}]
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
                         ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                         ;; collection to change position, check that and fix up if needed
                         (api/maybe-reconcile-collection-position! dashboard-data)
                         ;; Ok, now save the Dashboard
                         (u/prog1 (db/insert! Dashboard dashboard-data)
                           ;; Get cards from existing dashboard and associate to copied dashboard
                           (doseq [card (:ordered_cards existing-dashboard)]
                             (api/check-500 (dashboard/add-dashcard! <> (:card_id card) card)))))]
    (snowplow/track-event! ::snowplow/dashboard-created api/*current-user-id* {:dashboard-id (u/the-id dashboard)})
    (events/publish-event! :dashboard-create dashboard)))


;;; --------------------------------------------- Fetching/Updating/Etc. ---------------------------------------------

(api/defendpoint GET "/:id"
  "Get Dashboard with ID."
  [id]
  (let [dashboard (get-dashboard id)]
    (events/publish-event! :dashboard-read (assoc dashboard :actor_id api/*current-user-id*))
    (last-edit/with-last-edit-info dashboard :dashboard)))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding` or `embedding_params`. Embedding must be
  enabled."
  [dash-before-update dash-updates]
  (when (or (api/column-will-change? :enable_embedding dash-before-update dash-updates)
            (api/column-will-change? :embedding_params dash-before-update dash-updates))
    (validation/check-embedding-enabled)
    (api/check-superuser)))

(api/defendpoint PUT "/:id"
  "Update a Dashboard.

  Usually, you just need write permissions for this Dashboard to do this (which means you have appropriate
  permissions for the Cards belonging to this Dashboard), but to change the value of `enable_embedding` you must be a
  superuser."
  [id :as {{:keys [description name parameters caveats points_of_interest show_in_getting_started enable_embedding
                   embedding_params position archived collection_id collection_position cache_ttl]
            :as dash-updates} :body}]
  {name                    (s/maybe su/NonBlankString)
   description             (s/maybe s/Str)
   caveats                 (s/maybe s/Str)
   points_of_interest      (s/maybe s/Str)
   show_in_getting_started (s/maybe s/Bool)
   enable_embedding        (s/maybe s/Bool)
   embedding_params        (s/maybe su/EmbeddingParams)
   parameters              (s/maybe [su/Parameter])
   position                (s/maybe su/IntGreaterThanZero)
   archived                (s/maybe s/Bool)
   collection_id           (s/maybe su/IntGreaterThanZero)
   collection_position     (s/maybe su/IntGreaterThanZero)
   cache_ttl               (s/maybe su/IntGreaterThanZero)}
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
         ;; description, position, collection_id, and collection_position are allowed to be `nil`.
         ;; Everything else must be non-nil
         (u/select-keys-when dash-updates
           :present #{:description :position :collection_id :collection_position :cache_ttl}
           :non-nil #{:name :parameters :caveats :points_of_interest :show_in_getting_started :enable_embedding
                      :embedding_params :archived})))))
  ;; now publish an event and return the updated Dashboard
  (let [dashboard (Dashboard id)]
    (events/publish-event! :dashboard-update (assoc dashboard :actor_id api/*current-user-id*))
    (assoc dashboard :last-edit-info (last-edit/edit-information-for-user @api/*current-user*))))

;; TODO - We can probably remove this in the near future since it should no longer be needed now that we're going to
;; be setting `:archived` to `true` via the `PUT` endpoint instead
(api/defendpoint DELETE "/:id"
  "Delete a Dashboard."
  [id]
  (log/warn (str "DELETE /api/dashboard/:id is deprecated. Instead of deleting a Dashboard, you should change its "
                 "`archived` value via PUT /api/dashboard/:id."))
  (let [dashboard (api/write-check Dashboard id)]
    (db/delete! Dashboard :id id)
    (events/publish-event! :dashboard-delete (assoc dashboard :actor_id api/*current-user-id*)))
  api/generic-204-no-content)

(defn- param-target->field-id [target query]
  (when-let [field-clause (params/param-target->field-clause target {:card {:dataset_query query}})]
    (mbql.u/match-one field-clause [:field (id :guard integer?) _] id)))

;; TODO -- should we only check *new* or *modified* mappings?
(s/defn ^:private check-parameter-mapping-permissions
  "Starting in 0.41.0, you must have *data* permissions in order to add or modify a DashboardCard parameter mapping."
  {:added "0.41.0"}
  [parameter-mappings :- [{:target   s/Any
                           :card-id  su/IntGreaterThanZero
                           s/Keyword s/Any}]]
  (when (seq parameter-mappings)
    ;; calculate a set of all Field IDs referenced by parameter mappings; then from those Field IDs calculate a set of
    ;; all Table IDs to which those Fields belong. This is done in a batched fashion so we can avoid N+1 query issues
    ;; if there happen to be a lot of parameters
    (let [card-ids              (into #{} (map :card-id) parameter-mappings)
          card-id->query        (db/select-id->field :dataset_query Card :id [:in card-ids])
          field-ids             (set (for [{:keys [target card-id]} parameter-mappings
                                           :let                     [query    (or (card-id->query card-id)
                                                                                  (throw (ex-info (tru "Card {0} does not exist or does not have a valid query."
                                                                                                       card-id)
                                                                                                  {:status-code 404
                                                                                                   :card-id     card-id})))
                                                                     field-id (param-target->field-id target query)]
                                           :when                    field-id]
                                       field-id))
          table-ids             (when (seq field-ids)
                                  (db/select-field :table_id Field :id [:in field-ids]))
          table-id->database-id (when (seq table-ids)
                                  (db/select-id->field :db_id Table :id [:in table-ids]))]
      (doseq [table-id table-ids
              :let     [database-id (table-id->database-id table-id)]]
        ;; check whether we'd actually be able to query this Table (do we have ad-hoc data perms for it?)
        (when-not (query-perms/can-query-table? database-id table-id)
          (throw (ex-info (tru "You must have data permissions to add a parameter referencing the Table {0}."
                               (pr-str (db/select-one-field :name Table :id table-id)))
                          {:status-code        403
                           :database-id        database-id
                           :table-id           table-id
                           :actual-permissions @api/*current-user-permissions-set*})))))))

;; TODO - param should be `card_id`, not `cardId` (fix here + on frontend at the same time)
(api/defendpoint POST "/:id/cards"
  "Add a `Card` to a Dashboard."
  [id :as {{:keys [cardId parameter_mappings], :as dashboard-card} :body}]
  {cardId             (s/maybe su/IntGreaterThanZero)
   parameter_mappings [su/Map]}
  (api/check-not-archived (api/write-check Dashboard id))
  (when cardId
    (api/check-not-archived (api/read-check Card cardId)))
  (check-parameter-mapping-permissions (for [mapping parameter_mappings]
                                         (assoc mapping :card-id cardId)))
  (u/prog1 (api/check-500 (dashboard/add-dashcard! id cardId (-> dashboard-card
                                                                 (assoc :creator_id api/*current-user*)
                                                                 (dissoc :cardId))))
    (events/publish-event! :dashboard-add-cards {:id id, :actor_id api/*current-user-id*, :dashcards [<>]})
    (snowplow/track-event! ::snowplow/question-added-to-dashboard
                           api/*current-user-id*
                           {:dashboard-id id, :question-id cardId})))

(defn- existing-parameter-mappings
  "Returns a map of DashboardCard ID -> parameter mappings for a Dashboard of the form

  {<dashboard-card-id> #{{:target       [:dimension [:field 1000 nil]]
                          :parameter_id \"abcdef\"}}}"
  [dashboard-id]
  (m/map-vals (fn [mappings]
                (into #{} (map #(select-keys % [:target :parameter_id])) mappings))
              (db/select-id->field :parameter_mappings DashboardCard :dashboard_id dashboard-id)))

(defn- check-updated-parameter-mapping-permissions
  "In 0.41.0+ you now require data permissions for the Table in question to add or modify Dashboard parameter mappings.
  Check that the current user has the appropriate permissions. Don't check any parameter mappings that already exist
  for this Dashboard -- only check permissions for new or modified ones."
  [dashboard-id dashcards]
  (let [dashcard-id->existing-mappings (existing-parameter-mappings dashboard-id)
        existing-mapping?              (fn [dashcard-id mapping]
                                         (let [[mapping]         (mi/normalize-parameters-list [mapping])
                                               existing-mappings (get dashcard-id->existing-mappings dashcard-id)]
                                           (contains? existing-mappings (select-keys mapping [:target :parameter_id]))))
        new-mappings                   (for [{mappings :parameter_mappings, dashcard-id :id} dashcards
                                             mapping                                         mappings
                                             :when                                           (not (existing-mapping? dashcard-id mapping))]
                                         (assoc mapping :dashcard-id dashcard-id))
        ;; need to add the appropriate `:card-id` for all the new mappings we're going to check.
        dashcard-id->card-id           (when (seq new-mappings)
                                         (db/select-id->field :card_id DashboardCard
                                           :dashboard_id dashboard-id
                                           :id           [:in (set (map :dashcard-id new-mappings))]))
        new-mappings (for [{:keys [dashcard-id], :as mapping} new-mappings]
                       (assoc mapping :card-id (get dashcard-id->card-id dashcard-id)))]
    (check-parameter-mapping-permissions new-mappings)))

(def ^:private UpdatedDashboardCard
  (su/with-api-error-message
    {:id                                  (su/with-api-error-message su/IntGreaterThanOrEqualToZero
                                            "value must be a DashboardCard ID.")
     (s/optional-key :sizeX)              (s/maybe su/IntGreaterThanZero)
     (s/optional-key :sizeY)              (s/maybe su/IntGreaterThanZero)
     (s/optional-key :row)                (s/maybe su/IntGreaterThanOrEqualToZero)
     (s/optional-key :col)                (s/maybe su/IntGreaterThanOrEqualToZero)
     (s/optional-key :parameter_mappings) (s/maybe [{:parameter_id su/NonBlankString
                                                     :target       s/Any
                                                     s/Keyword     s/Any}])
     (s/optional-key :series)             (s/maybe [su/Map])
     s/Keyword                            s/Any}
    "value must be a valid DashboardCard map."))

;; TODO - we should use schema to validate the format of the Cards :D
(api/defendpoint PUT "/:id/cards"
  "Update `Cards` on a Dashboard. Request body should have the form:

    {:cards [{:id                 ... ; DashboardCard ID
              :sizeX              ...
              :sizeY              ...
              :row                ...
              :col                ...
              :parameter_mappings ...
              :series             [{:id 123
                                    ...}]}
             ...]}"
  [id :as {{:keys [cards]} :body}]
  {cards (su/non-empty [UpdatedDashboardCard])}
  (api/check-not-archived (api/write-check Dashboard id))
  (check-updated-parameter-mapping-permissions id cards)
  (dashboard/update-dashcards! id cards)
  (events/publish-event! :dashboard-reposition-cards {:id id, :actor_id api/*current-user-id*, :dashcards cards})
  {:status :ok})

(api/defendpoint DELETE "/:id/cards"
  "Remove a `DashboardCard` from a Dashboard."
  [id dashcardId]
  {dashcardId su/IntStringGreaterThanZero}
  (api/check-not-archived (api/write-check Dashboard id))
  (when-let [dashboard-card (DashboardCard (Integer/parseInt dashcardId))]
    (api/check-500 (dashboard-card/delete-dashboard-card! dashboard-card api/*current-user-id*))
    api/generic-204-no-content))

(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for Dashboard with ID."
  [id]
  (api/read-check Dashboard id)
  (revision/revisions+details Dashboard id))

(api/defendpoint POST "/:id/revert"
  "Revert a Dashboard to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id su/IntGreaterThanZero}
  (api/write-check Dashboard id)
  (revision/revert!
    :entity      Dashboard
    :id          id
    :user-id     api/*current-user-id*
    :revision-id revision_id))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api/defendpoint POST "/:dashboard-id/public_link"
  "Generate publicly-accessible links for this Dashboard. Returns UUID to be used in public links. (If this
  Dashboard has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [dashboard-id]
  (api/check-superuser)
  (validation/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check Dashboard dashboard-id))
  {:uuid (or (db/select-one-field :public_uuid Dashboard :id dashboard-id)
             (u/prog1 (str (UUID/randomUUID))
               (db/update! Dashboard dashboard-id
                 :public_uuid       <>
                 :made_public_by_id api/*current-user-id*)))})

(api/defendpoint DELETE "/:dashboard-id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [dashboard-id]
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-exists? Dashboard :id dashboard-id, :public_uuid [:not= nil], :archived false)
  (db/update! Dashboard dashboard-id
    :public_uuid       nil
    :made_public_by_id nil)
  {:status 204, :body nil})

(api/defendpoint GET "/public"
  "Fetch a list of Dashboards with public UUIDs. These dashboards are publicly-accessible *if* public sharing is
  enabled."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (db/select [Dashboard :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(api/defendpoint GET "/embeddable"
  "Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding
  endpoints and a signed JWT."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-embedding-enabled)
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
                               (:id (populate/get-or-create-root-container-collection))
                               (db/select-one-field :id 'Collection
                                 :personal_owner_id api/*current-user-id*))]
    (->> (dashboard/save-transient-dashboard! dashboard parent-collection-id)
         (events/publish-event! :dashboard-create))))


;;; ------------------------------------- Chain-filtering param value endpoints --------------------------------------

(def ^:const result-limit
  "How many results to return when chain filtering"
  1000)

(s/defn ^:private mappings->field-ids :- (s/maybe #{su/IntGreaterThanZero})
  [parameter-mappings :- (s/maybe (s/cond-pre #{dashboard-card/ParamMapping} [dashboard-card/ParamMapping]))]
  (set (for [param parameter-mappings
             :let  [field-clause (params/param-target->field-clause (:target param) (:dashcard param))]
             :when field-clause
             :let  [field-id (mbql.u/match-one field-clause [:field (id :guard integer?) _] id)]
             :when field-id]
         field-id)))

(defn- param-key->field-ids
  "Get Field ID(s) associated with a parameter in a Dashboard.

    (param-key->field-ids (Dashboard 62) \"ee876336\")
    ;; -> #{276}"
  [dashboard param-key]
  {:pre [(string? param-key)]}
  (let [{:keys [resolved-params]} (hydrate dashboard :resolved-params)
        param                     (get resolved-params param-key)]
    (mappings->field-ids (:mappings param))))

(defn- chain-filter-constraints [dashboard constraint-param-key->value]
  (into {} (for [[param-key value] constraint-param-key->value
                 field-id          (param-key->field-ids dashboard param-key)]
             [field-id value])))

(s/defn chain-filter
  "C H A I N filters!

    ;; show me categories
    (chain-filter 62 \"ee876336\" {})
    ;; -> {:values          (\"African\" \"American\" \"Artisan\" ...)
           :has_more_values false}

    ;; show me categories that have expensive restaurants
    (chain-filter 62 \"ee876336\" {\"6f10a41f\" 4})
    ;; -> {:values          (\"Japanese\" \"Steakhouse\")
           :has_more_values false}"
  ([dashboard param-key constraint-param-key->value]
   (chain-filter dashboard param-key constraint-param-key->value nil))

  ([dashboard                   :- su/Map
    param-key                   :- su/NonBlankString
    constraint-param-key->value :- su/Map
    query                       :- (s/maybe su/NonBlankString)]
   (let [dashboard (hydrate dashboard :resolved-params)]
     (when-not (get (:resolved-params dashboard) param-key)
       (throw (ex-info (tru "Dashboard does not have a parameter with the ID {0}" (pr-str param-key))
                       {:resolved-params (keys (:resolved-params dashboard))
                        :status-code     400})))
     (let [constraints (chain-filter-constraints dashboard constraint-param-key->value)
           field-ids   (param-key->field-ids dashboard param-key)]
      (when (empty? field-ids)
        (throw (ex-info (tru "Parameter {0} does not have any Fields associated with it" (pr-str param-key))
                        {:param       (get (:resolved-params dashboard) param-key)
                         :status-code 400})))
       ;; TODO - we should combine these all into a single UNION ALL query against the data warehouse instead of doing a
       ;; separate query for each Field (for parameters that are mapped to more than one Field)
      (try
        (let [results (map (if (seq query)
                               #(chain-filter/chain-filter-search % constraints query :limit result-limit)
                                #(chain-filter/chain-filter % constraints :limit result-limit))
                           field-ids)
              values (distinct (mapcat :values results))
              has_more_values (boolean (some true? (map :has_more_values results)))]
          ;; results can come back as [v ...] *or* as [[orig remapped] ...]. Sort by remapped value if that's the case
          {:values          (if (sequential? (first values))
                              (sort-by second values)
                              (sort values))
           :has_more_values has_more_values})
        (catch clojure.lang.ExceptionInfo e
          (if (= (:type (u/all-ex-data e)) qp.error-type/missing-required-permissions)
            (api/throw-403 e)
            (throw e))))))))

(api/defendpoint GET "/:id/params/:param-key/values"
  "Fetch possible values of the parameter whose ID is `:param-key`. Optionally restrict these values by passing query
  parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that are possible when parameter 'def' is set to 100
    GET /api/dashboard/1/params/abc/values?def=100"
  [id param-key :as {:keys [query-params]}]
  (let [dashboard (api/read-check Dashboard id)]
    (chain-filter dashboard param-key query-params)))

(api/defendpoint GET "/:id/params/:param-key/search/:query"
  "Fetch possible values of the parameter whose ID is `:param-key` that contain `:query`. Optionally restrict
  these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that contain 'Cam' and are possible when parameter 'def' is set
    ;; to 100
     GET /api/dashboard/1/params/abc/search/Cam?def=100

  Currently limited to first 1000 results."
  [id param-key query :as {:keys [query-params]}]
  (let [dashboard (api/read-check Dashboard id)]
    (chain-filter dashboard param-key query-params query)))

(api/defendpoint GET "/params/valid-filter-fields"
  "Utility endpoint for powering Dashboard UI. Given some set of `filtered` Field IDs (presumably Fields used in
  parameters) and a set of `filtering` Field IDs that will be used to restrict values of `filtered` Fields, for each
  `filtered` Field ID return the subset of `filtering` Field IDs that would actually be used in a chain filter query
  with these Fields.

  e.g. in a chain filter query like

    GET /api/dashboard/10/params/PARAM_1/values?PARAM_2=100

  Assume `PARAM_1` maps to Field 1 and `PARAM_2` maps to Fields 2 and 3. The underlying MBQL query may or may not
  filter against Fields 2 and 3, depending on whether an FK relationship that lets us create a join against Field 1
  can be found. You can use this endpoint to determine which of those Fields is actually used:

    GET /api/dashboard/params/valid-filter-fields?filtered=1&filtering=2&filtering=3
    ;; ->
    {1 [2 3]}

  Results are returned as a map of

    `filtered` Field ID -> subset of `filtering` Field IDs that would be used in chain filter query"
  [:as {{:keys [filtered filtering]} :params}]
  {filtered  (s/cond-pre su/IntStringGreaterThanZero
                         (su/non-empty [su/IntStringGreaterThanZero]))
   filtering (s/maybe (s/cond-pre su/IntStringGreaterThanZero
                                  (su/non-empty [su/IntStringGreaterThanZero])))}
    ;; parse IDs for filtered/filtering
  (letfn [(parse-ids [s]
            (set (cond
                   (string? s)     [(Integer/parseUnsignedInt s)]
                   (sequential? s) (map (fn [i] (Integer/parseUnsignedInt i)) s))))]
    (let [filtered-field-ids  (parse-ids filtered)
          filtering-field-ids (parse-ids filtering)]
      (doseq [field-id (set/union filtered-field-ids filtering-field-ids)]
        (api/read-check Field field-id))
      (into {} (for [field-id filtered-field-ids]
                 [field-id (sort (chain-filter/filterable-field-ids field-id filtering-field-ids))])))))


;;; ---------------------------------- Running the query associated with a Dashcard ----------------------------------

(def ParameterWithID
  "Schema for a parameter map with an string `:id`."
  (su/with-api-error-message
    {:id       su/NonBlankString
     s/Keyword s/Any}
    "value must be a parameter map with an 'id' key"))

(api/defendpoint POST "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
  "Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it."
  [dashboard-id dashcard-id card-id :as {{:keys [parameters], :as body} :body}]
  {parameters (s/maybe [ParameterWithID])}
  (m/mapply qp.dashboard/run-query-for-dashcard-async
            (merge
             body
             {:dashboard-id dashboard-id
              :card-id      card-id
              :dashcard-id  dashcard-id})))

(api/defendpoint POST "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format"
  "Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it, and return
  its results as a file in the specified format.

  `parameters` should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint
  is normally used to power 'Download Results' buttons that use HTML `form` actions)."
  [dashboard-id dashcard-id card-id export-format :as {{:keys [parameters], :as request-parameters} :params}]
  {parameters    (s/maybe su/JSONString)
   export-format api.dataset/ExportFormat}
  (m/mapply qp.dashboard/run-query-for-dashcard-async
            (merge
             request-parameters
             {:dashboard-id  dashboard-id
              :card-id       card-id
              :dashcard-id   dashcard-id
              :export-format export-format
              :parameters    (json/parse-string parameters keyword)
              :constraints   nil
              ;; TODO -- passing this `:middleware` map is a little repetitive, need to think of a way to not have to
              ;; specify this all over the codebase any time we want to do a query with an export format. Maybe this
              ;; should be the default if `export-format` isn't `:api`?
              :middleware    {:process-viz-settings?  true
                              :skip-results-metadata? true
                              :ignore-cached-results? true
                              :format-rows?           false
                              :js-int-to-string?      false}})))

(api/defendpoint POST "/pivot/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
  "Run a pivot table query for a specific DashCard."
  [dashboard-id dashcard-id card-id :as {{:keys [parameters], :as body} :body}]
  {parameters (s/maybe [ParameterWithID])}
  (m/mapply qp.dashboard/run-query-for-dashcard-async
            (merge
             body
             {:dashboard-id dashboard-id
              :card-id      card-id
              :dashcard-id  dashcard-id
              :qp-runner    qp.pivot/run-pivot-query})))

(api/define-routes)
