(ns metabase.queries-rest.api.card
  "/api/card endpoints."
  (:require
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.models.interface :as mi]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.queries.core :as queries]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.api :as api.dataset]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.request.core :as request]
   [metabase.revisions.core :as revisions]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Filtered Fetch Fns -----------------------------------------------

(def ^:private order-by-name {:order-by [[:%lower.name :asc]]})

(defmulti ^:private cards-for-filter-option*
  {:arglists '([filter-option & args])}
  (fn [filter-option & _]
    (keyword filter-option)))

;; return all Cards. This is the default filter option.
(defmethod cards-for-filter-option* :all
  [_]
  (t2/select :model/Card, :archived false, order-by-name))

;; return Cards created by the current user
(defmethod cards-for-filter-option* :mine
  [_]
  (t2/select :model/Card, :creator_id api/*current-user-id*, :archived false, order-by-name))

;; return all Cards bookmarked by the current user.
(defmethod cards-for-filter-option* :bookmarked
  [_]
  (let [bookmarks (t2/select [:model/CardBookmark :card_id] :user_id api/*current-user-id*)]
    (->> (t2/hydrate bookmarks :card)
         (map :card)
         (remove :archived)
         (sort-by :name))))

;; Return all Cards belonging to Database with `database-id`.
(defmethod cards-for-filter-option* :database
  [_ database-id]
  (t2/select :model/Card, :database_id database-id, :archived false, order-by-name))

;; Return all Cards belonging to `Table` with `table-id`.
(defmethod cards-for-filter-option* :table
  [_ table-id]
  (t2/select :model/Card, :table_id table-id, :archived false, order-by-name))

;; Cards that have been archived.
(defmethod cards-for-filter-option* :archived
  [_]
  (t2/select :model/Card, :archived true, order-by-name))

;; Cards that are using a given model.
(defmethod cards-for-filter-option* :using_model
  [_filter-option model-id]
  (->> (t2/select :model/Card {:select [:c.*]
                               :from [[:report_card :m]]
                               :join [[:report_card :c] [:and
                                                         [:= :c.database_id :m.database_id]
                                                         [:or
                                                          [:like :c.dataset_query (format "%%card__%s%%" model-id)]
                                                          [:like :c.dataset_query (format "%%#%s%%" model-id)]]]]
                               :where [:and [:= :m.id model-id] [:not :c.archived]]
                               :order-by [[[:lower :c.name] :asc]]})
       ;; now check if model-id really occurs as a card ID
       (filter (fn [card]
                 (some-> card :dataset_query not-empty lib/all-source-card-ids (contains? model-id))))))

(mu/defn- cards-for-segment-or-metric
  [model-type :- [:enum :segment :metric]
   model-id   :- pos-int?]
  (->> (t2/select :model/Card (merge order-by-name
                                     {:where [:like :dataset_query (str "%" (name model-type) "%" model-id "%")]}))
       ;; now check if the segment/metric with model-id really occurs in a filter/aggregation expression
       (filter (fn [{query :dataset_query, :as _card}]
                 (when (seq query)
                   (case model-type
                     :segment (lib/uses-segment? query model-id)
                     :metric  (lib/uses-metric? query model-id)))))))

(defmethod cards-for-filter-option* :using_segment
  [_filter-option model-id]
  (cards-for-segment-or-metric :segment model-id))

(defn- cards-for-filter-option [filter-option model-id-or-nil]
  (-> (apply cards-for-filter-option* filter-option (when model-id-or-nil [model-id-or-nil]))
      (t2/hydrate :creator :collection)))

;;; -------------------------------------------- List of public or embeddable cards -----------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/public"
  "Fetch a list of Cards with public UUIDs. These cards are publicly-accessible *if* public sharing is enabled."
  []
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (t2/select [:model/Card :name :id :public_uuid :card_schema], :public_uuid [:not= nil], :archived false))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/embeddable"
  "Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT."
  []
  (perms/check-has-application-permission :setting)
  (embedding.validation/check-embedding-enabled)
  (t2/select [:model/Card :name :id :card_schema], :enable_embedding true, :archived false))

;;; -------------------------------------------- Fetching a Card or Cards --------------------------------------------
(def ^:private card-filter-options
  "a valid card filter option."
  (keys (methods cards-for-filter-option*)))

(defn- db-id-via-table
  [model model-id]
  (t2/select-one-fn :db_id :model/Table {:select [:t.db_id]
                                         :from [[:metabase_table :t]]
                                         :join [[model :m] [:= :t.id :m.table_id]]
                                         :where [:= :m.id model-id]}))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get all the Cards. Option filter param `f` can be used to change the set of Cards that are returned; default is
  `all`, but other options include `mine`, `bookmarked`, `database`, `table`, `using_model`, `using_segment`, and
  `archived`. See corresponding implementation functions above for the specific behavior of each filter
  option. :card_index:"
  [_route-params
   {:keys [f], model-id :model_id} :- [:map
                                       [:f        {:default :all}  (into [:enum] card-filter-options)]
                                       [:model_id {:optional true} [:maybe ms/PositiveInt]]]]
  (when (contains? #{:database :table :using_model :using_segment} f)
    (api/checkp (integer? model-id) "model_id" (format "model_id is a required parameter when filter mode is '%s'"
                                                       (name f)))
    (case f
      :database      (api/read-check :model/Database model-id)
      :table         (api/read-check :model/Database (t2/select-one-fn :db_id :model/Table, :id model-id))
      :using_model   (api/read-check :model/Card model-id)
      :using_segment (api/read-check :model/Database (db-id-via-table :segment model-id))))
  (let [cards          (filter mi/can-read? (cards-for-filter-option f model-id))
        last-edit-info (:card (revisions/fetch-last-edited-info {:card-ids (map :id cards)}))]
    (into []
          (map (fn [{:keys [id] :as card}]
                 (if-let [edit-info (get last-edit-info id)]
                   (assoc card :last-edit-info edit-info)
                   card)))
          cards)))

(defn- hydrate-card-details
  "Adds additional information to a `Card` selected with toucan that is needed by the frontend. This should be the same information
  returned by all API endpoints where the card entity is cached (i.e. GET, PUT, POST) since the frontend replaces the Card
  it currently has with returned one -- See #4283"
  [{card-id :id :as card}]
  (span/with-span!
    {:name       "hydrate-card-details"
     :attributes {:queries/id card-id}}
    (-> card
        (t2/hydrate :based_on_upload
                    :creator
                    :can_write
                    :can_run_adhoc_query
                    :dashboard_count
                    [:dashboard :moderation_status]
                    :average_query_time
                    :last_query_start
                    :parameter_usage_count
                    :can_restore
                    :can_delete
                    :can_manage_db
                    [:collection :is_personal]
                    [:moderation_reviews :moderator_details]
                    :is_remote_synced)
        (update :dashboard #(some-> % (select-keys [:name :id :moderation_status])))
        (cond->
         (queries/model? card) (t2/hydrate :persisted
                                           ;; can_manage_db determines whether we should enable model persistence settings
                                           :can_manage_db)))))

(defn- get-card
  "Get `Card` with ID."
  [id]
  (let [with-last-edit-info #(first (revisions/with-last-edit-info [%] :card))
        raw-card (t2/select-one :model/Card :id id)]
    (-> raw-card
        api/read-check
        hydrate-card-details
        ;; Cal 2023-11-27: why is last-edit-info hydrated differently for GET vs PUT and POST
        with-last-edit-info
        collection.root/hydrate-root-collection
        (api/present-in-trash-if-archived-directly (collection/trash-collection-id)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get `Card` with ID.

  As of v57, returns the MBQL query (`dataset_query`) as MBQL 5; to return the query as MBQL 4 (aka legacy MBQL)
  instead, you can specify `?legacy-mbql=true`."
  [{:keys [id]} :- [:map
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]
   {legacy-mbql? :legacy-mbql
    :keys        []} :- [:map [:legacy-mbql {:optional true, :default false} [:maybe :boolean]]]]
  (let [resolved-id (eid-translation/->id-or-404 :card id)
        card (get-card resolved-id)]
    (cond-> card
      legacy-mbql?
      (update :dataset_query (fn [query]
                               #_{:clj-kondo/ignore [:discouraged-var]}
                               (cond-> query
                                 (seq query) lib/->legacy-MBQL))))))

(defn- check-allowed-to-remove-from-existing-dashboards [card]
  (let [dashboards (or (:in_dashboards card)
                       (:in_dashboards (t2/hydrate card :in_dashboards)))]
    (doseq [dashboard dashboards]
      (api/write-check dashboard))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/dashboards"
  "Get a list of `{:name ... :id ...}` pairs for all the dashboards this card appears in."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [card (get-card id)
        dashboards (:in_dashboards (t2/hydrate card :in_dashboards))]
    (doseq [dashboard dashboards]
      (api/write-check dashboard))
    (map #(dissoc % :collection_id :description :archived) dashboards)))

(defn- card-columns-from-names
  [card names]
  (when-let [names (not-empty (set names))]
    (filter #(names (:name %)) (:result_metadata card))))

(defn- cols->kebab-case
  [cols]
  (map #(update-keys % u/->kebab-case-en) cols))

(mu/defn- source-cols
  [card
   source :- [:enum ::breakouts ::aggregations]]
  (if-let [names (get-in card [:visualization_settings (case source
                                                         ::breakouts    :graph.dimensions
                                                         ::aggregations :graph.metrics)])]
    (cols->kebab-case (card-columns-from-names card names))
    (some->> card
             :dataset_query
             not-empty
             lib/returned-columns
             (filter (case source
                       ::breakouts    :lib/breakout?
                       ::aggregations #(= (:lib/source %) :source/aggregations))))))

(defn- area-bar-line-series-are-compatible?
  [first-card second-card]
  (and (#{:area :line :bar} (:display second-card))
       (let [initial-dimensions (source-cols first-card ::breakouts)
             new-dimensions     (source-cols second-card ::breakouts)
             new-metrics        (source-cols second-card ::aggregations)]
         (cond
           ;; must have at least one dimension and one metric
           (or (zero? (count new-dimensions))
               (zero? (count new-metrics)))
           false

           ;; all metrics must be numeric
           (not (every? lib.types.isa/numeric? new-metrics))
           false

           ;; both or neither primary dimension must be dates
           (not= (lib.types.isa/temporal? (first initial-dimensions))
                 (lib.types.isa/temporal? (first new-dimensions)))
           false

           ;; both or neither primary dimension must be numeric
           ;; a timestamp field is both date and number so don't enforce the condition if both fields are dates; see #2811
           (and (not= (lib.types.isa/numeric? (first initial-dimensions))
                      (lib.types.isa/numeric? (first new-dimensions)))
                (not (and
                      (lib.types.isa/temporal? (first initial-dimensions))
                      (lib.types.isa/temporal? (first new-dimensions)))))
           false

           :else true))))

(defmulti series-are-compatible?
  "Check if the `second-card` is compatible to be used as series of `card`."
  {:arglists '([card second-card])}
  (fn [card _second-card]
    (:display card)))

(defmethod series-are-compatible? :area
  [first-card second-card]
  (area-bar-line-series-are-compatible? first-card second-card))

(defmethod series-are-compatible? :line
  [first-card second-card]
  (area-bar-line-series-are-compatible? first-card second-card))

(defmethod series-are-compatible? :bar
  [first-card second-card]
  (area-bar-line-series-are-compatible? first-card second-card))

(defmethod series-are-compatible? :scalar
  [first-card second-card]
  (and (= :scalar (:display second-card))
       (= 1
          (count (:result_metadata first-card))
          (count (:result_metadata second-card)))))

(def ^:private supported-series-display-type (set (keys (methods series-are-compatible?))))

(defn- fetch-compatible-series*
  "Implementation of `fetch-compatible-series`.

  Provide `page-size` to limit the number of cards returned, it does not guaranteed to return exactly `page-size` cards.
  Use `fetch-compatible-series` for that."
  [card database-id->metadata-provider {:keys [query last-cursor page-size exclude-ids] :as _options}]
  (let [matching-cards  (t2/select :model/Card
                                   :archived false
                                   :display [:in supported-series-display-type]
                                   :id [:not= (:id card)]
                                   (cond-> {:order-by [[:id :desc]]
                                            :where    [:and]}
                                     last-cursor
                                     (update :where conj [:< :id last-cursor])

                                     (seq exclude-ids)
                                     (update :where conj [:not [:in :id exclude-ids]])

                                     query
                                     (update :where conj [:like :%lower.name (str "%" (u/lower-case-en query) "%")])

                                     ;; add a little buffer to the page to account for cards that are not
                                     ;; compatible + do not have permissions to read
                                     ;; this is just a heuristic, but it should be good enough
                                     page-size
                                     (assoc :limit (+ 10 page-size))))
        database-ids (set (keys database-id->metadata-provider))
        database-id->metadata-provider (->> matching-cards
                                            (filter #(or (nil? (get-in % [:visualization_settings :graph.metrics]))
                                                         (nil? (get-in % [:visualization_settings :graph.dimensions]))))
                                            (keep :database_id)
                                            (set)
                                            (remove #(contains? database-ids %))
                                            (into database-id->metadata-provider
                                                  (map (juxt identity lib-be/application-database-metadata-provider))))
        compatible-cards (->> matching-cards
                              (filter mi/can-read?)
                              (filter #(or
                                         ;; columns name on native query are not match with the column name in viz-settings. why??
                                         ;; so we can't use series-are-compatible? to filter out incompatible native cards.
                                         ;; => we assume all native queries are compatible and FE will figure it out later
                                        (= (:query_type %) :native)
                                        (series-are-compatible? card %))))]
    (if page-size
      [database-id->metadata-provider (take page-size compatible-cards)]
      [database-id->metadata-provider compatible-cards])))

(defn- fetch-compatible-series
  "Fetch a list of compatible series for `card`.

  options:
  - exclude-ids: filter out these card ids
  - query:       filter cards by name
  - last-cursor: the id of the last card from the previous page
  - page-size:   is nullable, it'll try to fetches exactly `page-size` cards if there are enough cards."
  ([card options]
   (fetch-compatible-series
    card
    options
    {(:database_id card) (lib-be/application-database-metadata-provider (:database_id card))}
    []))

  ([card {:keys [page-size] :as options} database-id->metadata-provider current-cards]
   (let [[database-id->metadata-provider cards] (fetch-compatible-series* card database-id->metadata-provider options)
         new-cards (concat current-cards cards)]
     ;; if the total card fetches is less than page-size and there are still more, continue fetching
     (if (and (some? page-size)
              (seq cards)
              (< (count cards) page-size))
       (fetch-compatible-series card
                                (merge options
                                       {:page-size   (- page-size (count cards))
                                        :last-cursor (:id (last cards))})
                                database-id->metadata-provider
                                new-cards)
       new-cards))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/series"
  "Fetches a list of compatible series with the card with id `card_id`.

  - `last_cursor` with value is the id of the last card from the previous page to fetch the next page.
  - `query` to search card by name.
  - `exclude_ids` to filter out a list of card ids"
  [{:keys [id]} :- [:map
                    [:id int?]]
   {:keys [last_cursor query exclude_ids]}
   :- [:map
       [:last_cursor {:optional true} [:maybe ms/PositiveInt]]
       [:query       {:optional true} [:maybe ms/NonBlankString]]
       [:exclude_ids {:optional true} [:maybe [:fn
                                               {:error/fn (fn [_ _] (deferred-tru "value must be a sequence of positive integers"))}
                                               (fn [ids]
                                                 (every? pos-int? (api/parse-multi-values-param ids parse-long)))]]]]]
  (let [exclude_ids  (when exclude_ids (api/parse-multi-values-param exclude_ids parse-long))
        card         (-> (t2/select-one :model/Card :id id) api/check-404 api/read-check)
        card-display (:display card)]
    (when-not (supported-series-display-type card-display)
      (throw (ex-info (tru "Card with type {0} is not compatible to have series" (name card-display))
                      {:display         card-display
                       :allowed-display (map name supported-series-display-type)
                       :status-code     400})))
    (fetch-compatible-series
     card
     {:exclude-ids exclude_ids
      :query       query
      :last-cursor last_cursor
      :page-size   (request/limit)})))

;;; ------------------------------------------------- Creating Cards -------------------------------------------------

(mu/defn- check-if-card-can-be-saved
  [dataset-query :- [:maybe ::queries.schema/query]
   card-type     :- [:maybe ::queries.schema/card-type]]
  (when (and (seq dataset-query) (= card-type :metric))
    (when-not (lib/can-save dataset-query card-type)
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

(def ^:private CardCreateSchema
  "Schema for creating a new card"
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
   [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `Card`. Card `type` can be `question`, `metric`, or `model`."
  [_route-params
   _query-params
   {card-type :type, collection-id :collection_id, :as card} :- CardCreateSchema]
  (let [card (-> card
                 (update :dataset_query lib-be/normalize-query)
                 (cond-> (some? collection-id)
                   (update :collection_id #(eid-translation/->id-or-404 :collection %))))
        query (:dataset_query card)]
    (check-if-card-can-be-saved query card-type)
    ;; check that we have permissions to run the query that we're trying to save
    (query-perms/check-run-permissions-for-query query)
    ;; check that we have permissions for the collection we're trying to save this card to, if applicable.
    ;; if a `dashboard-id` is specified, check permissions on the *dashboard's* collection ID.
    (api/create-check :model/Card {:collection_id (actual-collection-id card)})
    (try
      (lib/check-card-overwrite ::no-id query)
      (catch clojure.lang.ExceptionInfo e
        (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400)))))
    (-> (queries/create-card! card @api/*current-user*)
        hydrate-card-details
        (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/copy"
  "Copy a `Card`, with the new name 'Copy of _name_'"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [orig-card (api/read-check :model/Card id)
        new-name  (trs "Copy of {0}" (:name orig-card))
        new-card  (assoc orig-card :name new-name)]
    (-> (queries/create-card! new-card @api/*current-user*)
        hydrate-card-details
        (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*)))))

;;; ------------------------------------------------- Updating Cards -------------------------------------------------

(mu/defn- check-allowed-to-modify-query
  "If the query is being modified, check that we have data permissions to run the query."
  [card-before-updates :- ::queries.schema/card
   card-updates        :- ::queries.schema/card]
  (when (api/column-will-change? :dataset_query card-before-updates card-updates)
    (query-perms/check-run-permissions-for-query (:dataset_query card-updates))))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding`, `embedding_type` or `embedding_params`. Embedding must be
  enabled."
  [card-before-updates card-updates]
  (when (or (api/column-will-change? :enable_embedding card-before-updates card-updates)
            (api/column-will-change? :embedding_type card-before-updates card-updates)
            (api/column-will-change? :embedding_params card-before-updates card-updates))
    (embedding.validation/check-embedding-enabled)
    (api/check-superuser)))

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

;;; TODO -- merge this into `:metabase.queries.schema/card`
(def ^:private CardUpdateSchema
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
   [:dashboard_tab_id {:optional true} [:maybe ms/PositiveInt]]])

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
  "Updates a card - impl"
  [id :- ::lib.schema.id/card
   {metadata :result_metadata, card-type :type, :as card-updates} :- CardUpdateSchema
   delete-old-dashcards? :- :boolean]
  (let [card-updates (m/update-existing card-updates :dataset_query lib-be/normalize-query)
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
                                   (queries/model? card-before-update)
                                   (queries/model? card-updates))]
      ;; Do various permissions checks
      (doseq [f [check-update-result-metadata-data-perms
                 check-allowed-to-move
                 check-allowed-to-modify-query
                 check-allowed-to-change-embedding]]
        (f card-before-update card-updates))
      (let [{:keys [metadata metadata-future]} (queries/maybe-async-result-metadata
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
            card                               (-> (queries/update-card! {:card-before-update    card-before-update
                                                                          :card-updates          card-updates
                                                                          :actor                 @api/*current-user*
                                                                          :delete-old-dashcards? delete-old-dashcards?})
                                                   hydrate-card-details
                                                   (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*)))]
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
          (queries/save-metadata-async! metadata-future card))
        card))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a `Card`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {delete-old-dashcards? :delete_old_dashcards} :- [:map
                                                     [:delete_old_dashcards {:optional true} [:maybe :boolean]]]
   body :- CardUpdateSchema]
  (update-card! id body (boolean delete-old-dashcards?)))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/query_metadata"
  "Get all of the required query metadata for a card."
  [{:keys [id]} :- [:map
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]]
  (lib-be/with-metadata-provider-cache
    (let [resolved-id (eid-translation/->id-or-404 :card id)]
      (queries/batch-fetch-card-metadata [(get-card resolved-id)]))))

;;; ------------------------------------------------- Deleting Cards -------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Hard delete a Card. To soft delete, use `PUT /api/queries/:id`"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [card (api/write-check :model/Card id)]
    (t2/delete! :model/Card :id id)
    (events/publish-event! :event/card-delete {:object card :user-id api/*current-user-id*}))
  api/generic-204-no-content)

;;; -------------------------------------------- Bulk Collections Update ---------------------------------------------

(defn- update-collection-positions!
  "For cards that have a position in the previous collection, add them to the end of the new collection, trying to
  preserve the order from the original collections. Note it's possible for there to be multiple collections
  (and thus duplicate collection positions) merged into this new collection. No special tie breaker logic for when
  that's the case, just use the order the DB returned it in"
  [new-collection-id-or-nil cards]
  ;; Sorting by `:collection_position` to ensure lower position cards are appended first
  (let [sorted-cards        (sort-by :collection_position cards)
        max-position-result (t2/select-one [:model/Card [:%max.collection_position :max_position]]
                                           :collection_id new-collection-id-or-nil)
        ;; collection_position for the next card in the collection
        starting-position   (inc (get max-position-result :max_position 0))]

    ;; This is using `map` but more like a `doseq` with multiple seqs. Wrapping this in a `doall` as we don't want it
    ;; to be lazy and we're just going to discard the results
    (doall
     (map (fn [idx {:keys [collection_id collection_position] :as card}]
            ;; We are removing this card from `collection_id` so we need to reconcile any
            ;; `collection_position` entries left behind by this move
            (api/reconcile-position-for-collection! collection_id collection_position nil)
            ;; Now we can update the card with the new collection and a new calculated position
            ;; that appended to the end
            (t2/update! :model/Card
                        (u/the-id card)
                        {:collection_position idx
                         :collection_id       new-collection-id-or-nil}))
          ;; These are reversed because of the classic issue when removing an item from array. If we remove an
          ;; item at index 1, everything above index 1 will get decremented. By reversing our processing order we
          ;; can avoid changing the index of cards we haven't yet updated
          (reverse (range starting-position (+ (count sorted-cards) starting-position)))
          (reverse sorted-cards)))))

(defn- move-cards-to-collection! [new-collection-id-or-nil card-ids]
  ;; if moving to a collection, make sure we have write perms for it
  (when new-collection-id-or-nil
    (api/write-check :model/Collection new-collection-id-or-nil))
  ;; for each affected card...
  (when (seq card-ids)
    (let [cards (t2/select [:model/Card :id :collection_id :collection_position :dataset_query :card_schema]
                           {:where [:and [:in :id (set card-ids)]
                                    [:or [:not= :collection_id new-collection-id-or-nil]
                                     (when new-collection-id-or-nil
                                       [:= :collection_id nil])]]})] ; poisioned NULLs = ick
      ;; ...check that we have write permissions for it...
      (doseq [card cards]
        (api/write-check card))
      ;; ...and check that we have write permissions for the old collections if applicable
      (doseq [old-collection-id (set (filter identity (map :collection_id cards)))]
        (api/write-check :model/Collection old-collection-id))

      ;; Ensure all of the card updates occur in a transaction. Read committed (the default) really isn't what we want
      ;; here. We are querying for the max card position for a given collection, then using that to base our position
      ;; changes if the cards are moving to a different collection. Without repeatable read here, it's possible we'll
      ;; get duplicates
      (t2/with-transaction [_conn]
        ;; If any of the cards have a `:collection_position`, we'll need to fixup the old collection now that the cards
        ;; are gone and update the position in the new collection
        (when-let [cards-with-position (seq (filter :collection_position cards))]
          (update-collection-positions! new-collection-id-or-nil cards-with-position))

        ;; ok, everything checks out. Set the new `collection_id` for all the Cards that haven't been updated already
        (when-let [cards-without-position (seq (for [card cards
                                                     :when (not (:collection_position card))]
                                                 (u/the-id card)))]
          (t2/update! (t2/table-name :model/Card)
                      {:id [:in (set cards-without-position)]}
                      {:collection_id new-collection-id-or-nil}))
        (doseq [card cards]
          (collection/check-non-remote-synced-dependencies card)))))

  (when new-collection-id-or-nil
    (events/publish-event! :event/collection-touch {:collection-id new-collection-id-or-nil :user-id api/*current-user-id*})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/collections"
  "Bulk update endpoint for Card Collections. Move a set of `Cards` with `card_ids` into a `Collection` with
  `collection_id`, or remove them from any Collections by passing a `null` `collection_id`."
  [_route-params
   _query-params
   {:keys [card_ids collection_id]} :- [:map
                                        [:card_ids      [:sequential ms/PositiveInt]]
                                        [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (move-cards-to-collection! collection_id card_ids)
  {:status :ok})

;;; ------------------------------------------------ Running a Query -------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:card-id/query"
  "Run the query associated with a Card."
  [{:keys [card-id]} :- [:map
                         [:card-id [:or ms/PositiveInt ms/NanoIdString]]]
   _query-params
   {:keys [parameters ignore_cache dashboard_id collection_preview]}
   :- [:map
       [:ignore_cache       {:default false} :boolean]
       [:collection_preview {:optional true} [:maybe :boolean]]
       [:dashboard_id       {:optional true} [:maybe ms/PositiveInt]]]]
  ;; TODO -- we should probably warn if you pass `dashboard_id`, and tell you to use the new
  ;;
  ;;    POST /api/dashboard/:dashboard-id/queries/:card-id/query
  ;;
  ;; endpoint instead. Or error in that situation? We're not even validating that you have access to this Dashboard.
  (let [resolved-card-id (eid-translation/->id-or-404 :card card-id)]
    (qp.card/process-query-for-card
     resolved-card-id :api
     :parameters parameters
     :ignore-cache ignore_cache
     :dashboard-id dashboard_id
     :context (if collection_preview :collection :question)
     :middleware   {:process-viz-settings? false})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:card-id/query/:export-format"
  "Run the query associated with a Card, and return its results as a file in the specified format.

  `parameters`, `pivot-results?` and `format-rows?` should be passed as application/x-www-form-urlencoded form content
  or json in the body. This is because this endpoint is normally used to power 'Download Results' buttons that use
  HTML `form` actions)."
  [{:keys [card-id export-format]} :- [:map
                                       [:card-id       ms/PositiveInt]
                                       [:export-format ::qp.schema/export-format]]
   _query-params
   {:keys          [parameters]
    pivot-results? :pivot_results
    format-rows?   :format_rows
    :as            _body}
   :- [:map
       [:parameters    {:optional true} [:maybe
                                         ;; support JSON-encoded parameters for backwards compatibility when with this
                                         ;; was still submitted with a `<form>`... see
                                         ;; https://metaboat.slack.com/archives/C010L1Z4F9S/p1738003606875659
                                         {:decode/api (fn [x]
                                                        (cond-> x
                                                          (string? x) json/decode+kw))}
                                         ;; TODO -- figure out what the actual schema for parameters is supposed to be
                                         ;; here... [[::parameters.schema/parameter]] is used for other endpoints in this namespace but
                                         ;; it breaks existing tests
                                         [:sequential [:map-of :keyword :any]]]]
       [:format_rows   {:default false} ms/BooleanValue]
       [:pivot_results {:default false} ms/BooleanValue]]]
  (qp.card/process-query-for-card
   card-id export-format
   :parameters  parameters
   :constraints nil
   :context     (api.dataset/export-format->context export-format)
   :middleware  {:process-viz-settings?  true
                 :skip-results-metadata? true
                 :ignore-cached-results? true
                 :format-rows?           format-rows?
                 :pivot?                 pivot-results?
                 :js-int-to-string?      false}))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:card-id/public_link"
  "Generate publicly-accessible links for this Card. Returns UUID to be used in public links. (If this Card has
  already been shared, it will return the existing public link rather than creating a new one.)  Public sharing must
  be enabled."
  [{:keys [card-id]} :- [:map
                         [:card-id ms/PositiveInt]]]
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check :model/Card card-id))
  (let [{existing-public-uuid :public_uuid} (t2/select-one [:model/Card :public_uuid :card_schema] :id card-id)
        uuid (or existing-public-uuid
                 (u/prog1 (str (random-uuid))
                   (events/publish-event! :event/card-public-link-created
                                          {:object-id card-id
                                           :user-id api/*current-user-id*})
                   (t2/update! :model/Card card-id
                               {:public_uuid       <>
                                :made_public_by_id api/*current-user-id*})))]
    {:uuid uuid}))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:card-id/public_link"
  "Delete the publicly-accessible link to this Card."
  [{:keys [card-id]} :- [:map
                         [:card-id ms/PositiveInt]]]
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Card :id card-id, :public_uuid [:not= nil])
  (t2/update! :model/Card card-id
              {:public_uuid       nil
               :made_public_by_id nil})
  (events/publish-event! :event/card-public-link-deleted
                         {:object-id card-id
                          :user-id api/*current-user-id*})
  {:status 204, :body nil})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/pivot/:card-id/query"
  "Run the query associated with a Card."
  [{:keys [card-id]} :- [:map
                         [:card-id ms/PositiveInt]]
   _query-params
   {:keys [parameters ignore_cache]
    :or   {ignore_cache false}} :- [:map
                                    [:ignore_cache {:optional true} [:maybe :boolean]]]]
  (qp.card/process-query-for-card card-id :api
                                  :parameters   parameters
                                  :qp           qp.pivot/run-pivot-query
                                  :ignore-cache ignore_cache))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:card-id/params/:param-key/values"
  "Fetch possible values of the parameter whose ID is `:param-key`.

    ;; fetch values for Card 1 parameter 'abc' that are possible
    GET /api/queries/1/params/abc/values"
  [{:keys [card-id param-key]} :- [:map
                                   [:card-id   ms/PositiveInt]
                                   [:param-key ::lib.schema.parameter/id]]]
  (queries/card-param-values (api/read-check :model/Card card-id) param-key))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:card-id/params/:param-key/search/:query"
  "Fetch possible values of the parameter whose ID is `:param-key` that contain `:query`.

    ;; fetch values for Card 1 parameter 'abc' that contain 'Orange';
     GET /api/queries/1/params/abc/search/Orange

  Currently limited to first 1000 results."
  [{:keys [card-id param-key query]} :- [:map
                                         [:card-id   ms/PositiveInt]
                                         [:param-key ::lib.schema.parameter/id]
                                         [:query     ms/NonBlankString]]]
  (queries/card-param-values (api/read-check :model/Card card-id) param-key query))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/params/:param-key/remapping"
  "Fetch the remapped value for a given value of the parameter with ID `:param-key`.

    ;; fetch the remapped value for Card 1 parameter 'abc' for value 100
    GET /api/queries/1/params/abc/remapping?value=100"
  [{:keys [id param-key]} :- [:map
                              [:id ::lib.schema.id/card]
                              [:param-key ::lib.schema.parameter/id]]
   {:keys [value]}        :- [:map [:value :string]]]
  (-> (api/read-check :model/Card id)
      (queries/card-param-remapped-value param-key (codec/url-decode value))))
