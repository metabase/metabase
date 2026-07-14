(ns metabase.queries.card-write
  "Creating and updating a card, with the checks a card write must pass.

   [[metabase.queries.models.card/create-card!]] and [[metabase.queries.models.card/update-card!]] write the
   row and run no permission check at all. The checks live here — run permission on the query being saved,
   create/write permission on the collection it lands in and the one it leaves, the type's own shape rules,
   the cycle check, the embedding guard — so that every surface that writes a card runs the same ones.

   `POST /api/card` and `PUT /api/card/:id` are two such surfaces, and the MCP `question_write` and
   `metric_write` tools are two more. A surface that re-derived the stack would drift from it on the day
   someone adds a check to one and not the others, and the drift would be silent and in the direction of
   permitting more."
  (:require
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.card :as queries.card]
   [metabase.queries.models.card :as card]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.search.core :as search]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def CardCreateSchema
  "Schema for creating a new card."
  [:map
   [:name                   ms/NonBlankString]
   [:type                   {:optional true} [:maybe ::queries.schema/card-type]]
   [:dataset_query          ms/Map]
   ;; TODO: Make entity_id a NanoID regex schema?
   [:entity_id              {:optional true} [:maybe ms/NonBlankString]]
   [:parameters             {:optional true} [:maybe ::parameters.schema/parameters]]
   [:parameter_mappings     {:optional true} [:maybe ::parameters.schema/parameter-mappings]]
   [:description            {:optional true} [:maybe ms/NonBlankString]]
   [:display                ms/NonBlankString]
   [:visualization_settings ms/Map]
   [:collection_id          {:optional true} [:maybe [:or ms/PositiveInt ms/NanoIdString]]]
   [:collection_position    {:optional true} [:maybe ms/PositiveInt]]
   [:result_metadata        {:optional true} [:maybe analyze/ResultsMetadata]]
   [:cache_ttl              {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_id           {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]
   [:size                   {:optional true} [:maybe [:map
                                                      [:size_x ms/PositiveInt]
                                                      [:size_y ms/PositiveInt]]]]])

;;; TODO -- merge this into `:metabase.queries.schema/card`
(def CardUpdateSchema
  "Schema for updating an existing card. Every field is optional: an update changes what it names."
  [:map
   [:name                   {:optional true} [:maybe ms/NonBlankString]]
   [:parameters             {:optional true} [:maybe ::parameters.schema/parameters]]
   [:parameter_mappings     {:optional true} [:maybe ::parameters.schema/parameter-mappings]]
   [:dataset_query          {:optional true} [:maybe ms/Map]]
   [:type                   {:optional true} [:maybe ::queries.schema/card-type]]
   [:display                {:optional true} [:maybe ms/NonBlankString]]
   [:description            {:optional true} [:maybe :string]]
   [:visualization_settings {:optional true} [:maybe ms/Map]]
   [:archived               {:optional true} [:maybe :boolean]]
   [:enable_embedding       {:optional true} [:maybe :boolean]]
   [:embedding_type         {:optional true} [:maybe :string]]
   [:embedding_params       {:optional true} [:maybe ms/EmbeddingParams]]
   [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position    {:optional true} [:maybe ms/PositiveInt]]
   [:result_metadata        {:optional true} [:maybe analyze/ResultsMetadata]]
   [:cache_ttl              {:optional true} [:maybe ms/PositiveInt]]
   [:collection_preview     {:optional true} [:maybe :boolean]]
   [:dashboard_id           {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]])

(defn normalize-dataset-query-or-400
  "Strictly normalize an incoming `:dataset_query` from an API request, converting any normalization
  failure into a 400 Bad Request."
  [query]
  (try
    (lib-be/normalize-query nil query {:strict? true})
    (catch Throwable e
      (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400) e)))))

(mu/defn- check-if-card-can-be-saved
  [dataset-query :- [:maybe ::queries.schema/query]
   card-type     :- [:maybe ::queries.schema/card-type]]
  (when (and (seq dataset-query) (= card-type :metric))
    (when-not (lib/can-save? dataset-query card-type)
      (throw (ex-info (tru "Card of type {0} is invalid, cannot be saved." (name card-type))
                      {:type        card-type
                       :status-code 400})))))

(defn- actual-collection-id
  "Given a body from the `POST` endpoint to create a card, returns the `collection_id` that the card will be placed in.
  Because creating a Dashboard Question does not require specifying a `collection_id` (it's inferred from the
  `dashboard_id`), this may be different from the `collection_id`. Normally if you don't specify a `collection_id`
  that means we put it in the root collection (`nil` id), but if you specify a `dashboard_id` we'll need to look it
  up."
  [body]
  (let [[_ collection-id :as specified-collection-id?] (find body :collection_id)
        ;; unlike collection_id, `dashboard_id=null` isn't different than not specifying it at all.
        dashboard-id (:dashboard_id body)
        dashboard-id->collection-id #(t2/select-one-fn :collection_id [:model/Dashboard :collection_id] %)]
    (cond
      ;; you specified both - they must match
      (and specified-collection-id? dashboard-id)
      (let [dashboard-collection-id (dashboard-id->collection-id dashboard-id)]
        (api/check-400 (= collection-id dashboard-collection-id)
                       (tru "Mismatch detected between Dashboard''s `collection_id` ({0}) and `collection_id` ({1})"
                            dashboard-collection-id
                            collection-id))
        collection-id)

      specified-collection-id? collection-id

      dashboard-id (dashboard-id->collection-id dashboard-id)

      :else nil)))

;;; ------------------------------------------------- Creating Cards -------------------------------------------------

(mu/defn create-card!
  "Create a card, running every check a create must pass, and return it hydrated the way `POST /api/card`
  returns it.

  This is the way in for anything that creates a card on a user's behalf.
  [[metabase.queries.core/create-card!]] writes the row and checks nothing."
  [{card-type :type, collection-id :collection_id, :as new-card} :- CardCreateSchema]
  (let [new-card (-> new-card
                     (update :dataset_query normalize-dataset-query-or-400)
                     (cond-> (some? collection-id)
                       ;; Strict check to prevent a malformed query (coerced to `{}` by [[lib-be/normalize-query]])
                       ;; from being written into the DB (#74615).
                       (update :collection_id #(eid-translation/->id-or-404 :collection %))))
        query    (:dataset_query new-card)]
    (check-if-card-can-be-saved query card-type)
    ;; check that we have permissions to run the query that we're trying to save.
    ;; Strip :query-permissions/perms first -- it is populated internally by the QP
    ;; middleware, so any value already on the incoming query is dropped here.
    (query-perms/check-run-permissions-for-query (dissoc query :query-permissions/perms))
    ;; check that we have permissions for the collection we're trying to save this card to, if applicable.
    ;; if a `dashboard-id` is specified, check permissions on the *dashboard's* collection ID.
    (api/create-check :model/Card {:collection_id (actual-collection-id new-card)})
    (try
      (lib/check-card-overwrite ::no-id query)
      (catch clojure.lang.ExceptionInfo e
        (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400)))))
    (let [created-card (card/create-card! new-card @api/*current-user*)]
      (when (and (some? (:result_metadata new-card))
                 (= (name (:type created-card)) "question"))
        (events/publish-event! :event/card-create-with-result-metadata
                               {:card-id (:id created-card)
                                :user-id api/*current-user-id*}))
      (queries.card/hydrate-card-details created-card))))

;;; ------------------------------------------------- Updating Cards -------------------------------------------------

(mu/defn- check-allowed-to-modify-query
  "If the query is being modified, check that we have data permissions to run the query."
  [card-before-updates :- ::queries.schema/card
   card-updates        :- ::queries.schema/card]
  (when (api/column-will-change? :dataset_query card-before-updates card-updates)
    (query-perms/check-run-permissions-for-query (dissoc (:dataset_query card-updates) :query-permissions/perms))))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding`, `embedding_type` or `embedding_params`. Embedding must be
  enabled."
  [card-before-updates card-updates]
  (when (or (api/column-will-change? :enable_embedding card-before-updates card-updates)
            (api/column-will-change? :embedding_type card-before-updates card-updates)
            (api/column-will-change? :embedding_params card-before-updates card-updates))
    (embedding.validation/check-embedding-enabled)
    (api/check-superuser)))

(defn- check-allowed-to-remove-from-existing-dashboards
  [card]
  (let [dashboards (or (:in_dashboards card)
                       (:in_dashboards (t2/hydrate card :in_dashboards)))]
    (doseq [dashboard dashboards]
      (api/write-check dashboard))))

(mu/defn- check-allowed-to-move
  [card-before-update :- ::queries.schema/card
   card-updates       :- ::queries.schema/card]
  (when (api/column-will-change? :dashboard_id card-before-update card-updates)
    (check-allowed-to-remove-from-existing-dashboards card-before-update))
  (collection/check-allowed-to-change-collection card-before-update card-updates))

(mu/defn- check-update-result-metadata-data-perms
  [card-before-updates :- ::queries.schema/card
   card-updates        :- ::queries.schema/card]
  (when (api/column-will-change? :result_metadata card-before-updates card-updates)
    (let [database-id (some :database_id [card-before-updates card-updates])
          result-metadata (:result_metadata card-updates)]
      (query-perms/check-result-metadata-data-perms database-id result-metadata))))

(defn- maybe-populate-collection-id
  "`card-updates` may contain either or both of a `collection_id` and a `dashboard_id`.
  If either one is set, let's validate that they match using `actual-collection-id` and make sure that the
  `card-updates` contains the updated `collection_id`."
  [card-before-update card-updates]
  (let [collection-id (when (or (contains? card-updates :collection_id)
                                (contains? card-updates :dashboard_id))
                        (actual-collection-id card-updates))]
    (cond-> card-updates
      (or (api/column-will-change? :dashboard_id card-before-update card-updates)
          (api/column-will-change? :collection_id card-before-update card-updates))
      (assoc :collection_id collection-id))))

(mu/defn update-card!
  "Update the card `id` names, running every check an update must pass, and return it hydrated the way
  `PUT /api/card/:id` returns it.

  This is the way in for anything that updates a card on a user's behalf.
  [[metabase.queries.core/update-card!]] writes the row and checks nothing."
  [id :- ::lib.schema.id/card
   {metadata :result_metadata, card-type :type, :as card-updates} :- CardUpdateSchema
   delete-old-dashcards? :- :boolean]
  ;; Strict check to prevent a malformed query (coerced to `{}` by [[lib-be/normalize-query]])
  ;; from being written into the DB (#74615).
  (let [card-updates (m/update-existing card-updates :dataset_query normalize-dataset-query-or-400)
        query        (:dataset_query card-updates)]
    (check-if-card-can-be-saved query card-type)
    (when-some [query (:dataset_query card-updates)]
      (try
        (lib/check-card-overwrite id query)
        (catch clojure.lang.ExceptionInfo e
          (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400))))))
    (let [card-before-update     (t2/hydrate (api/write-check :model/Card id)
                                             [:moderation_reviews :moderator_details])
          card-updates           (maybe-populate-collection-id
                                  card-before-update
                                  (api/updates-with-archived-directly card-before-update card-updates))
          is-model-after-update? (if (nil? card-type)
                                   (card/model? card-before-update)
                                   (card/model? card-updates))]
      ;; Do various permissions checks
      (doseq [f [check-update-result-metadata-data-perms
                 check-allowed-to-move
                 check-allowed-to-modify-query
                 check-allowed-to-change-embedding]]
        (f card-before-update card-updates))
      (let [{:keys [metadata metadata-future]} (card.metadata/maybe-async-result-metadata
                                                {:original-query    (:dataset_query card-before-update)
                                                 :query             query
                                                 :metadata          metadata
                                                 :original-metadata (:result_metadata card-before-update)
                                                 :model?            is-model-after-update?
                                                 :entity-id         (or (:entity_id card-updates)
                                                                        (:entity_id card-before-update))})
            card-updates                       (merge card-updates
                                                      (when (and (some? card-type)
                                                                 is-model-after-update?
                                                                 ;; leave display unchanged if explicitly set to "list"
                                                                 (not (= :list (keyword (get card-updates :display)))))
                                                        {:display :table})
                                                      (when (and
                                                             (api/column-will-change? :dashboard_id
                                                                                      card-before-update
                                                                                      card-updates)
                                                             (:dashboard_id card-updates))
                                                        (api/check-400
                                                         (not (:archived card-updates)))
                                                        {:archived false}))
            card-updates                       (cond-> card-updates
                                                 metadata
                                                 (assoc :result_metadata           metadata
                                                        :verified-result-metadata? true))
            card                               (-> (card/update-card! {:card-before-update    card-before-update
                                                                       :card-updates          card-updates
                                                                       :actor                 @api/*current-user*
                                                                       :delete-old-dashcards? delete-old-dashcards?})
                                                   queries.card/hydrate-card-details)]
        ;; We expose the search results for models and metrics directly in FE grids, from which items can be archived.
        ;; The grid is then refreshed synchronously with the latest search results, so we need this change to be
        ;; reflected synchronously.
        ;; An alternate solution would be to have first class APIs for these views, that don't rely on an
        ;; eventually consistent search index.
        (when (:archived_directly card-updates)
          ;; For now, we hard-code all the possible search-model types, and queue them all as this has no extra overhead.
          ;; Ideally this would be DRY with the actual specification some way, but since this is a stop-gap solution, we
          ;; decided not to complicate the solution further to accomplish this.
          (search/bulk-ingest! (for [search-model ["card" "dataset" "metric"]]
                                 [search-model [:= :this.id id]])))
        (when metadata-future
          (log/infof "Metadata not available soon enough. Saving card %s and asynchronously updating metadata" id)
          (card.metadata/save-metadata-async! metadata-future card))
        card))))
