(ns metabase.queries-rest.api.card
  "/api/card endpoints."
  (:require
   [clojure.string :as str]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.data-apps.core :as data-apps]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.funnysql.util :as funnysql.util]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.models.interface :as mi]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.queries-rest.db :as queries-rest.db]
   [metabase.queries.core :as queries]
   [metabase.queries.models.card :as queries.card]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.api :as api.dataset]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.revisions.core :as revisions]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Filtered Fetch Fns -----------------------------------------------

(defmulti ^:private cards-for-filter-option*
  {:arglists '([filter-option & args])}
  (fn [filter-option & _]
    (keyword filter-option)))

;; return all Cards. This is the default filter option.
(defmethod cards-for-filter-option* :all
  [_]
  (queries-rest.db/unarchived-cards))

;; return Cards created by the current user
(defmethod cards-for-filter-option* :mine
  [_]
  (queries-rest.db/unarchived-cards-by-creator api/*current-user-id*))

;; return all Cards bookmarked by the current user.
(defmethod cards-for-filter-option* :bookmarked
  [_]
  (let [bookmarks (queries-rest.db/card-bookmarks-for-user api/*current-user-id*)]
    (->> (t2/hydrate bookmarks :card)
         (map :card)
         (remove :archived)
         (sort-by :name))))

;; Return all Cards belonging to Database with `database-id`.
(defmethod cards-for-filter-option* :database
  [_ database-id]
  (queries-rest.db/unarchived-cards-for-database database-id))

;; Return all Cards belonging to `Table` with `table-id`.
(defmethod cards-for-filter-option* :table
  [_ table-id]
  (queries-rest.db/unarchived-cards-for-table table-id))

;; Cards that have been archived.
(defmethod cards-for-filter-option* :archived
  [_]
  (queries-rest.db/archived-cards))

;; Cards that are using a given model.
(defmethod cards-for-filter-option* :using_model
  [_filter-option model-id]
  (->> (queries-rest.db/cards-using-model model-id)
       ;; now check if model-id really occurs as a card ID
       (filter (fn [card]
                 (some-> card :dataset_query not-empty lib/all-source-card-ids (contains? model-id))))))

(mu/defn- cards-for-segment-or-metric
  [model-type :- [:enum :segment :metric]
   model-id   :- pos-int?]
  (->> (queries-rest.db/cards-with-query-like (str "%" (name model-type) "%" model-id "%"))
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
  (queries-rest.db/public-cards))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/embeddable"
  "Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT."
  []
  (perms/check-has-application-permission :setting)
  ;; Not gated on `enable-embedding-modular`: an admin who turned guest embeds off still needs to see what is already
  ;; published. Publishing itself stays gated.
  (queries-rest.db/embeddable-cards))

;;; -------------------------------------------- Fetching a Card or Cards --------------------------------------------
(def ^:private card-filter-options
  "a valid card filter option."
  (keys (methods cards-for-filter-option*)))

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
   {:keys [f], model-id :model_id} :- [:map {:closed true}
                                       [:f        {:default :all}  (into [:enum] card-filter-options)]
                                       [:model_id {:optional true} [:maybe ms/PositiveInt]]]]
  (when (contains? #{:database :table :using_model :using_segment} f)
    (api/checkp (integer? model-id) "model_id" (format "model_id is a required parameter when filter mode is '%s'"
                                                       (name f)))
    (case f
      :database      (api/read-check :model/Database model-id)
      :table         (api/read-check :model/Database (queries-rest.db/table-database-id model-id))
      :using_model   (api/read-check :model/Card model-id)
      :using_segment (api/read-check :model/Database (queries-rest.db/segment-database-id model-id))))
  (let [cards          (mi/readable (cards-for-filter-option f model-id))
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
        (t2/hydrate :based_on_upload :creator :can_write :dashboard_count [:dashboard :moderation_status] :average_query_time :last_query_start :parameter_usage_count :can_restore :can_delete :can_manage_db [:collection :is_personal] [:moderation_reviews :moderator_details] :param_fields :is_remote_synced)
        (update :creator select-keys [:id :first_name :last_name :email :common_name])
        (update :param_fields (fn [param-fields]
                                (let [table-ids (into #{} (comp cat (map :table_id)) (vals param-fields))
                                      values    (perms/table-permissions-for-user (perms/user-info api/*current-user-id*)
                                                                                  :perms/view-data
                                                                                  (zipmap table-ids (repeat (:database_id card))))
                                      viewable? #(perms/at-least-as-permissive? :perms/view-data (get values %) :unrestricted)]
                                  (update-vals param-fields
                                               (fn [fields]
                                                 (filterv #(viewable? (:table_id %)) fields))))))
        (update :dashboard #(some-> % (select-keys [:name :id :moderation_status])))
        (cond->
         ;; can_manage_db determines whether we should enable model persistence settings
         (queries/model? card) (t2/hydrate :persisted :can_manage_db)))))

(defn- get-card
  "Get `Card` with ID."
  [id]
  (let [with-last-edit-info #(first (revisions/with-last-edit-info [%] :card))
        raw-card (queries-rest.db/card id)]
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
  "Get `Card` with ID. Returns the MBQL query (`dataset_query`) as MBQL 5."
  {:scope api-scope/data-app}
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]]
  (get-card (eid-translation/->id-or-404 :card id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/dashboards"
  "Get a list of `{:name ... :id ...}` pairs for all the dashboards this card appears in."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [card (get-card id)
        dashboards (:in_dashboards (t2/hydrate card :in_dashboards))]
    (doseq [dashboard (t2/hydrate dashboards :can_write)]
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
  [card   :- ::queries.schema/card
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

(mu/defn- fetch-compatible-series* :- [:sequential :map]
  "Implementation of `fetch-compatible-series`.

  Provide `page-size` to limit the number of cards returned, it does not guaranteed to return exactly `page-size` cards.
  Use `fetch-compatible-series` for that."
  [card    :- ::queries.schema/card
   {:keys [query last-cursor page-size exclude-ids] :as _options}
   :- [:map {:closed true}
       [:query       {:optional true} [:maybe ms/NonBlankString]]
       [:last-cursor {:optional true} [:maybe ms/PositiveInt]]
       [:page-size   {:optional true} [:maybe ms/PositiveInt]]
       [:exclude-ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]]]
  (let [matching-cards  (queries-rest.db/compatible-series-cards
                         (:id card)
                         supported-series-display-type
                         last-cursor
                         exclude-ids
                         (when query (funnysql.util/like-substring query))
                         ;; add a little buffer to the page to account for cards that are not
                         ;; compatible + do not have permissions to read
                         ;; this is just a heuristic, but it should be good enough
                         (when page-size (+ 10 page-size)))
        compatible-cards (->> (mi/readable matching-cards)
                              (filter #(or
                                        ;; columns name on native query are not match with the column name in viz-settings. why??
                                        ;; so we can't use series-are-compatible? to filter out incompatible native cards.
                                        ;; => we assume all native queries are compatible and FE will figure it out later
                                        (= (:query_type %) :native)
                                        (series-are-compatible? card %))))]
    (if page-size
      (take page-size compatible-cards)
      compatible-cards)))

(defn- fetch-compatible-series
  "Fetch a list of compatible series for `card`.

  options:
  - exclude-ids: filter out these card ids
  - query:       filter cards by name
  - last-cursor: the id of the last card from the previous page
  - page-size:   is nullable, it'll try to fetches exactly `page-size` cards if there are enough cards."
  ([card options]
   (fetch-compatible-series card options []))

  ([card {:keys [page-size] :as options} current-cards]
   (let [cards     (fetch-compatible-series* card options)
         new-cards (concat current-cards cards)]
     ;; if the total card fetches is less than page-size and there are still more, continue fetching
     (if (and (some? page-size)
              (seq cards)
              (< (count cards) page-size))
       (fetch-compatible-series card
                                (merge options
                                       {:page-size   (- page-size (count cards))
                                        :last-cursor (:id (last cards))})
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
  [{:keys [id]} :- [:map {:closed true}
                    [:id int?]]
   {:keys [last_cursor query exclude_ids]}
   :- [:map {:closed true}
       [:last_cursor {:optional true} [:maybe ms/PositiveInt]]
       [:query       {:optional true} [:maybe ms/NonBlankString]]
       [:exclude_ids {:optional true} [:maybe [:fn
                                               {:error/fn    (fn [_ _] (deferred-tru "value must be a sequence of positive integers"))
                                                :json-schema {:type "array" :items {:type "integer" :minimum 1}}}
                                               (fn [ids]
                                                 (every? pos-int? (api/parse-multi-values-param ids parse-long)))]]]]]
  (let [exclude_ids  (when exclude_ids (api/parse-multi-values-param exclude_ids parse-long))
        card         (-> (queries-rest.db/card id) api/check-404 api/read-check)
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

(def ^:private CardDisplay
  "The display type of a Card, normalized from its name."
  (mu/with-api-error-message
   [:and ::lib.schema.common/keyword [:fn #(not (str/blank? (name %)))]]
   (deferred-tru "value must be a non-blank string.")))

(defn- positive-ids-or-absent?
  "Whether the value under `k` in `settings` is absent or a sequence of positive integers."
  [settings k]
  (let [ids (get settings k)]
    (or (nil? ids) (and (sequential? ids) (every? pos-int? ids)))))

(def ^:private CardVisualizationSettings
  "The `visualization_settings` a request writes to a Card, whose timeline selections are sequences of positive ids."
  [:and
   {:description (deferred-tru "Value must be a map.")}
   ::lib.schema.visualization/visualization-settings
   [:fn
    {:error/fn (constantly (deferred-tru "Selected timeline IDs must be a sequence of positive integers."))}
    #(positive-ids-or-absent? % :timeline.selected_timeline_ids)]
   [:fn
    {:error/fn (constantly (deferred-tru "Excluded timeline event IDs must be a sequence of positive integers."))}
    #(positive-ids-or-absent? % :timeline.excluded_timeline_event_ids)]])

(def ^:private CardDatasetQuery
  "The query a request writes to a Card, which may not be a native query on the audit database."
  [:and
   {:description (deferred-tru "value must be a valid MBQL query.")}
   ::lib-be.schema/maybe-legacy-query
   [:fn
    {:error/fn (constantly (deferred-tru "You cannot save a native query that targets the audit database."))}
    (complement queries/native-audit-db-query?)]])

(def ^:private CardCreateSchema
  "Schema for creating a new card"
  [:map {:closed true}
   [:name                   ::queries.schema/card.name]
   [:type                   {:optional true} [:maybe ::queries.schema/card.type]]
   [:dataset_query          CardDatasetQuery]
   ;; TODO: Make entity_id a NanoID regex schema?
   [:entity_id              {:optional true} [:maybe ms/NonBlankString]]
   [:parameters             {:optional true} [:maybe ::parameters.schema/parameters]]
   [:parameter_mappings     {:optional true} [:maybe ::parameters.schema/parameter-mappings]]
   [:description            {:optional true} [:maybe ms/NonBlankString]]
   [:display                CardDisplay]
   [:visualization_settings CardVisualizationSettings]
   [:collection_id          {:optional true} [:maybe [:or ms/PositiveInt ms/NanoIdString]]]
   [:collection_position    {:optional true} [:maybe ms/PositiveInt]]
   [:result_metadata        {:optional true} [:maybe [:ref ::lib.schema.metadata/card.result-metadata]]]
   [:cache_ttl              {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_id           {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]
   [:size                   {:optional true} [:maybe [:map {:closed true}
                                                      [:size_x ms/PositiveInt]
                                                      [:size_y ms/PositiveInt]]]]
   [:source_card_id         {:optional true} [:maybe ms/PositiveInt]]])

(defn- check-parameter-permissions
  [parameters query]
  (queries/check-parameter-source-card-permissions parameters)
  (query-perms/check-parameter-field-permissions
   (into []
         (keep (fn [{:keys [target]}]
                 (when target
                   (params/param-target->field-id target {:dataset_query query}))))
         parameters)))

(defn- create-card!
  "Creates a Card from `card` for the current user, reconciling the positions in its Collection and putting it on its
  Dashboard when it is a dashboard question, in one transaction."
  [card]
  (t2/with-transaction [_conn]
    (collection/maybe-reconcile-collection-position! (select-keys card [:collection_id :collection_position]))
    (let [[created] (queries.card/create-cards! [(queries.card/new-card-row card api/*current-user-id*)])]
      (queries.card/place-new-dashboard-questions! [created] [card])
      created)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `Card`. Card `type` can be `question`, `metric`, or `model`. `source_card_id`, if given, must be a
  Card the current user can read; the new Card is then treated as a copy of it for timeline-permission purposes."
  [_route-params
   _query-params
   {card-type :type, collection-id :collection_id, source-card-id :source_card_id, :as card} :- CardCreateSchema]
  (let [source-card (some->> source-card-id (api/read-check :model/Card))
        card        (cond-> (dissoc card :source_card_id)
                      (some? collection-id)
                      (update :collection_id #(eid-translation/->id-or-404 :collection %)))
        query       (:dataset_query card)]
    ;; Parameter permissions run BEFORE the create stack: the parameter-specific 403 names neither
    ;; the table nor its ids, while the generic run-permissions error carries the query (and its
    ;; :source-table) in ex-data. Reversing these leaks that through the parameter path.
    (check-parameter-permissions (:parameters card) query)
    (queries/with-copy-source-card source-card
      (queries/check-allowed-to-create-card! card card-type))
    (queries/check-new-dashboard-questions-timeline-permissions [card])
    (let [created-card (create-card! card)]
      (when (and (some? (:result_metadata card))
                 (= (name (:type created-card)) "question"))
        (events/publish-event! :event/card-create-with-result-metadata
                               {:card-id (:id created-card)
                                :user-id api/*current-user-id*}))
      (-> created-card
          hydrate-card-details
          (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/copy"
  "Copy a `Card`, with the new name 'Copy of _name_'"
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [orig-card (api/read-check :model/Card id)
        new-name  (trs "Copy of {0}" (:name orig-card))
        new-card  (assoc orig-card :name new-name)]
    (queries/with-copy-source-card orig-card
      (api/create-check :model/Card new-card))
    (queries/check-new-dashboard-questions-timeline-permissions [new-card])
    (-> (create-card! new-card)
        hydrate-card-details
        (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*)))))

;;; ------------------------------------------------- Updating Cards -------------------------------------------------

;;; TODO -- merge this into `:metabase.queries.schema/card`
(def ^:private CardUpdateSchema
  [:map {:closed true}
   [:name                   {:optional true} [:maybe ::queries.schema/card.name]]
   [:parameters             {:optional true} [:maybe ::parameters.schema/parameters]]
   [:parameter_mappings     {:optional true} [:maybe ::parameters.schema/parameter-mappings]]
   [:dataset_query          {:optional true} [:maybe CardDatasetQuery]]
   [:type                   {:optional true} [:maybe ::queries.schema/card.type]]
   [:display                {:optional true} [:maybe CardDisplay]]
   [:description            {:optional true} [:maybe :string]]
   [:visualization_settings {:optional true} [:maybe CardVisualizationSettings]]
   [:archived               {:optional true} [:maybe :boolean]]
   [:enable_embedding       {:optional true} [:maybe :boolean]]
   [:embedding_type         {:optional true} [:maybe :string]]
   [:embedding_params       {:optional true} [:maybe ms/EmbeddingParams]]
   [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position    {:optional true} [:maybe ms/PositiveInt]]
   [:result_metadata        {:optional true} [:maybe [:ref ::lib.schema.metadata/card.result-metadata]]]
   [:cache_ttl              {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_id           {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_tab_id {:optional true} [:maybe ms/PositiveInt]]])

(defn- populate-collection-id
  "`card-updates` with the `collection-id` that [[queries/actual-collection-id]] gives them when they change the
  Dashboard or Collection of `card-before-update`."
  [card-before-update card-updates collection-id]
  (cond-> card-updates
    (or (api/column-will-change? (:dashboard_id card-before-update) (get card-updates :dashboard_id ::api/not-provided))
        (api/column-will-change? (:collection_id card-before-update) (get card-updates :collection_id ::api/not-provided)))
    (assoc :collection_id collection-id)))

(defn- maybe-populate-collection-id
  "`card-updates` with the `collection_id` that `actual-collection-id` gives them when they set a `collection_id` or a
  `dashboard_id`."
  [card-before-update card-updates]
  (populate-collection-id card-before-update
                          card-updates
                          (when (or (contains? card-updates :collection_id)
                                    (contains? card-updates :dashboard_id))
                            (queries/actual-collection-id card-updates))))

(mu/defn update-card!
  "Updates a card - impl"
  [id :- ::lib.schema.id/card
   {metadata :result_metadata, card-type :type, :as card-updates} :- CardUpdateSchema
   delete-old-dashcards? :- :boolean]
  (let [query (:dataset_query card-updates)]
    (queries/check-card-can-be-saved! query card-type)
    (check-parameter-permissions (:parameters card-updates)
                                 (or query (queries-rest.db/card-query id)))
    (let [card-before-update (api/write-check :model/Card id)
          card-updates       (maybe-populate-collection-id
                              card-before-update
                              (api/updates-without-collection-when-archiving card-before-update card-updates))]
      (queries/check-allowed-to-update-card! card-before-update card-updates)
      (let [card-updates (merge card-updates
                                (when (and
                                       (api/column-will-change? (:dashboard_id card-before-update)
                                                                (get card-updates :dashboard_id ::api/not-provided))
                                       (:dashboard_id card-updates))
                                  (api/check-400
                                   (not (:archived card-updates)))
                                  {:archived false}))
            row          (cond-> (queries.card/card-changes card-updates)
                           (and metadata (not query))
                           (assoc :verified-result-metadata? true))
            card         (t2/with-transaction [_conn]
                           (collection/maybe-reconcile-collection-position!
                            (select-keys card-before-update [:collection_id :collection_position])
                            (select-keys card-updates [:collection_id :collection_position]))
                           (queries.card/place-updated-dashboard-question! card-before-update card-updates delete-old-dashcards?)
                           (queries.card/update-cards! [(assoc row :id id)])
                           (queries-rest.db/card id))
            card         (-> card
                             hydrate-card-details
                             (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*)))]
        ;; We expose the search results for models and metrics directly in FE grids, from which items can be archived.
        ;; The grid is then refreshed synchronously with the latest search results, so we need this change to be
        ;; reflected synchronously.
        ;; An alternate solution would be to have first class APIs for these views, that don't rely on an
        ;; eventually consistent search index.
        (when (:archived card-updates)
          ;; For now, we hard-code all the possible search-model types, and queue them all as this has no extra overhead.
          ;; Ideally this would be DRY with the actual specification some way, but since this is a stop-gap solution, we
          ;; decided not to complicate the solution further to accomplish this.
          (search/bulk-ingest! (for [search-model ["card" "dataset" "metric"]]
                                 [search-model [:= :this.id id]])))
        card))))

(defn- moves-into-dashboard?
  "Whether `changes` of `card` put it in another Dashboard."
  [[card changes]]
  (and (:dashboard_id changes)
       (api/column-will-change? (:dashboard_id card) (get changes :dashboard_id ::api/not-provided))))

(defn move-cards!
  "Moves the Cards with `card-ids` to the Collection or Dashboard that `card-updates` (a `:collection_id` and a
  `:dashboard_id`) name, as [[update-card!]] does for each but checked together and written with one call: their
  DashboardCards leave the Dashboards they leave, positioned Cards go to the end of the new Collection in their order
  or lose their position in a Dashboard, and the gaps in the old Collections are closed."
  [card-ids card-updates]
  (let [ids           (distinct card-ids)
        id->card      (into {} (map (juxt :id identity))
                            (t2/hydrate (vec (vals (queries-rest.db/cards-by-id (vec ids)))) :can_write :in_dashboards))
        refused-id    (first (remove #(some-> (id->card %) mi/can-write?) ids))
        cards         (mapv id->card (take-while #(not= % refused-id) ids))
        collection-id (when (and (seq cards)
                                 (or (contains? card-updates :collection_id)
                                     (contains? card-updates :dashboard_id)))
                        (queries/actual-collection-id card-updates))
        card-changes  (mapv #(vector % (populate-collection-id % card-updates collection-id)) cards)
        archive-at    (first (keep-indexed (fn [i pair] (when (and (moves-into-dashboard? pair) (:archived (second pair))) i)) card-changes))
        checked       (if archive-at (subvec card-changes 0 (inc archive-at)) card-changes)]
    (when (seq checked)
      (queries/check-allowed-to-update-cards! checked))
    (when archive-at
      (api/check-400 false))
    (when refused-id
      (api/write-check (api/check-404 (id->card refused-id))))
    (let [card-changes (mapv (fn [[card changes]]
                               [card (cond-> changes
                                       (moves-into-dashboard? [card changes]) (assoc :archived false))])
                             card-changes)
          moves        (into []
                             (keep (fn [[card changes]]
                                     (when (and (:collection_position card)
                                                (not= (:collection_id card) (:collection_id changes))
                                                (contains? changes :collection_id))
                                       {:id (:id card) :collection_id (:collection_id card) :to (:collection_id changes)})))
                             card-changes)
          positions    (when (seq moves) (collection/moved-positions moves))]
      (queries.card/place-updated-dashboard-questions! card-changes true)
      (queries.card/update-cards! (mapv (fn [[card changes]] (assoc (queries.card/card-changes changes) :id (:id card)))
                                        card-changes))
      (when positions (collection/write-positions! positions)))))

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
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   {delete-old-dashcards? :delete_old_dashcards} :- [:map {:closed true}
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
  {:scope api-scope/data-app}
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]]
  (let [resolved-id (eid-translation/->id-or-404 :card id)]
    (queries/batch-fetch-card-metadata [(get-card resolved-id)])))

;;; ------------------------------------------------- Deleting Cards -------------------------------------------------

(api.macros/defendpoint :delete "/:id" :- ::api/generic-204-no-content
  "Hard delete a Card. To soft delete, use `PUT /api/queries/:id`"
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [card (api/write-check :model/Card id)]
    (api/check-403 (queries/can-delete? card))
    (queries.card/delete-cards! [id]))
  api/generic-204-no-content)

;;; -------------------------------------------- Bulk Collections Update ---------------------------------------------

(defn- collection-position-updates
  "The updates that move `sorted-cards` into the Collection `new-collection-id-or-nil`, or the root when nil.
  They take the positions after the Collection's highest, in the order given."
  [new-collection-id-or-nil sorted-cards]
  (let [max-position      (:max_position (queries-rest.db/max-collection-position new-collection-id-or-nil))
        ;; collection_position for the next card in the collection
        starting-position (inc (or max-position 0))]
    (into []
          (map-indexed (fn [idx moved-card]
                         {:id (u/the-id moved-card) :collection_position (+ starting-position idx)
                          :collection_id new-collection-id-or-nil}))
          sorted-cards)))

(defn- write-check-collection-or-root [collection-id-or-nil]
  (if collection-id-or-nil
    (api/write-check :model/Collection collection-id-or-nil)
    (api/write-check collection/root-collection)))

(defn- move-cards-to-collection! [new-collection-id-or-nil card-ids]
  (write-check-collection-or-root new-collection-id-or-nil)
  ;; for each affected card...
  (when (seq card-ids)
    (let [cards (queries-rest.db/cards-to-move-to-collection (set card-ids) new-collection-id-or-nil)] ; poisioned NULLs = ick
      ;; ...check that we have write permissions for it and for the old collections, root included
      (let [cards   (t2/hydrate (vec cards) :can_write)
            changes {:collection_id new-collection-id-or-nil}]
        (queries/check-allowed-to-update-cards! (mapv #(vector % changes) cards)))
      ;; Ensure all of the card updates occur in a transaction. Read committed (the default) really isn't what we want
      ;; here. We are querying for the max card position for a given collection, then using that to base our position
      ;; changes if the cards are moving to a different collection. Without repeatable read here, it's possible we'll
      ;; get duplicates
      (t2/with-transaction [_conn]
        (t2/with-transaction [_conn]
          ;; Cards with a `:collection_position` go to the end of the new Collection, and the positions they leave
          ;; behind are closed. They arrive in no fixed order and Cards from several old Collections can share a
          ;; position, so the id breaks ties.
          (let [with-position (sort-by (juxt :collection_position :id) (filter :collection_position cards))]
            (queries.card/update-cards! (into (collection-position-updates new-collection-id-or-nil with-position)
                                              (comp (remove :collection_position)
                                                    (map (fn [card] {:id (u/the-id card) :collection_id new-collection-id-or-nil})))
                                              cards))
            ;; We are removing these cards from their `collection_id` so we need to reconcile any `collection_position`
            ;; entries left behind by this move.
            (collection/reconcile-freed-positions! (update-vals (group-by :collection_id with-position)
                                                                (partial mapv :collection_position))))))
      nil))

  (when new-collection-id-or-nil
    (events/publish-event! :event/collection-touch {:collection-id new-collection-id-or-nil :user-id api/*current-user-id*})))

(api.macros/defendpoint :post "/collections" :- [:map {:closed true} [:status [:= :ok]]]
  "Bulk update endpoint for Card Collections. Move a set of `Cards` with `card_ids` into a `Collection` with
  `collection_id`, or remove them from any Collections by passing a `null` `collection_id`."
  [_route-params
   _query-params
   {:keys [card_ids collection_id]} :- [:map {:closed true}
                                        [:card_ids      [:sequential ms/PositiveInt]]
                                        [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (move-cards-to-collection! collection_id card_ids)
  {:status :ok})

;;; ------------------------------------------------ Running a Query -------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
(defn- serve-cached-stored-result
  "Cached branch of the card-query endpoint. Loads the stored_result, runs the cached-read
  perm gate, and returns the cached Dataset shape — same shape as a live query response, so
  the FE doesn't care which path served the data.

  The read-check on the URL card authorizes only snapshots actually materialized for that
  card, so the (card, stored_result) pairing must exist in `stored_result_use` — otherwise
  any readable card would serve as a skeleton key for arbitrary client-supplied snapshot
  ids. 404s (rather than 403s) on an unpaired id so it doesn't confirm the snapshot exists."
  [card-id stored-result-id sort]
  (api/check-exists? :model/StoredResultUse :card_id card-id :stored_result_id stored-result-id)
  (let [sr (api/check-404 (queries-rest.db/stored-result stored-result-id))]
    (queries/assert-can-view-card-snapshots! card-id)
    (api/check-404 (queries/cached-dataset sr sort))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:card-id/query"
  "Run the query associated with a Card. When `stored_result_id` is supplied, serve the cached snapshot instead of re-running the query
  and optionally re-sorts the rows via the `sort` body param."
  {:scope api-scope/data-app}
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id [:or ms/PositiveInt ms/NanoIdString]]]
   _query-params
   {:keys [parameters ignore_cache dashboard_id stored_result_id sort]}
   :- [:map {:closed true}
       [:ignore_cache       {:default false} :boolean]
       [:dashboard_id       {:optional true} [:maybe ms/PositiveInt]]
       [:parameters         {:optional true} [:maybe [:sequential ::parameters.schema/parameter-with-value]]]
       [:stored_result_id   {:optional true} [:maybe ms/PositiveInt]]
       [:sort               {:optional true}
        [:maybe [:enum "value_asc" "value_desc" "label_asc" "label_desc"]]]]
   request]
  (let [resolved-card-id (eid-translation/->id-or-404 :card card-id)
        _                (some-> (data-apps/request-data-app request) (data-apps/check-card resolved-card-id))
        card             (api/check-404 (queries-rest.db/card resolved-card-id))]
    (if stored_result_id
      (do
        (api/read-check card)
        (serve-cached-stored-result resolved-card-id stored_result_id sort))
      (do
        (when dashboard_id
          (api/read-check :model/Dashboard dashboard_id))
        (qp.card/process-query-for-card
         card :api
         :parameters parameters
         :ignore-cache ignore_cache
         :dashboard-id dashboard_id
         :card-transform (when dashboard_id qp.dashboard/card-with-default-metric-dimension)
         :context (if dashboard_id :dashboard :question)
         :middleware   {:process-viz-settings? false})))))

(api.macros/defendpoint :post "/:card-id/query/:export-format"
  :- ::qp.streaming/export-response
  "Run the query associated with a Card, and return its results as a file in the specified format.

  `csv_include_bom`, `parameters`, `pivot-results?` and `format-rows?` should be passed as application/x-www-form-urlencoded form content
  or json in the body. This is because this endpoint is normally used to power 'Download Results' buttons that use
  HTML `form` actions)."
  {:scope api-scope/data-app}
  [{:keys [card-id export-format]} :- [:map {:closed true}
                                       [:card-id       ms/PositiveInt]
                                       [:export-format ::qp.schema/export-format]]
   _query-params
   {:keys           [parameters]
    pivot-results?  :pivot_results
    format-rows?    :format_rows
    csv-include-bom? :csv_include_bom
    :as             _body}
   :- [:map {:closed true}
       ;; JSON-encoded string form supported for backwards compatibility with `<form>` submission... see
       ;; https://metaboat.slack.com/archives/C010L1Z4F9S/p1738003606875659
       [:parameters    {:optional true} [:maybe ::parameters.schema/api.parameter-values]]
       [:format_rows   {:default false} ms/BooleanValue]
       [:pivot_results {:default false} ms/BooleanValue]
       [:csv_include_bom {:default false} ms/BooleanValue]]
   request]
  (some-> (data-apps/request-data-app request) (data-apps/check-card card-id))
  (qp.card/process-query-for-card
   (api/check-404 (queries-rest.db/card card-id)) export-format
   :parameters  parameters
   :constraints nil
   :context     (api.dataset/export-format->context export-format)
   :middleware  {:process-viz-settings?  true
                 :skip-results-metadata? true
                 :ignore-cached-results? true
                 :format-rows?           format-rows?
                 :pivot?                 pivot-results?
                 :csv-include-bom?        (if (some? csv-include-bom?) csv-include-bom? false)
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
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id ms/PositiveInt]]]
  (let [new-uuid (str (random-uuid))
        card     (api/read-check :model/Card card-id)]
    (api/update-check card {:public_uuid new-uuid, :made_public_by_id api/*current-user-id*})
    (public-sharing.validation/check-public-sharing-enabled)
    (api/check-not-archived card)
    (let [{existing-public-uuid :public_uuid} (queries-rest.db/card-public-uuid-columns card-id)]
      (when-not existing-public-uuid
        (public-sharing.validation/check-public-link-allowed! :model/Card card-id))
      {:uuid (or existing-public-uuid
                 (u/prog1 new-uuid
                   (queries.card/update-cards! [{:id card-id :public_uuid       <>
                                                 :made_public_by_id api/*current-user-id*}])))})))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :delete "/:card-id/public_link" :- ::api/generic-204-no-content
  "Delete the publicly-accessible link to this Card."
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id ms/PositiveInt]]]
  (api/update-check (api/check-404 (queries-rest.db/card card-id)) {:public_uuid nil, :made_public_by_id nil})
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Card :id card-id, :public_uuid [:not= nil], :archived false)
  (queries.card/update-cards! [{:id card-id :public_uuid nil, :made_public_by_id nil}])
  {:status 204, :body nil})

(api.macros/defendpoint :post "/pivot/:card-id/query"
  :- ::qp.streaming/query-result-response
  "Run the query associated with a Card."
  {:scope api-scope/data-app}
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id ms/PositiveInt]]
   _query-params
   {:keys [parameters ignore_cache dashboard_id]
    :or   {ignore_cache false}} :- [:map {:closed true}
                                    [:ignore_cache {:optional true} [:maybe :boolean]]
                                    [:dashboard_id {:optional true} [:maybe ms/PositiveInt]]
                                    [:parameters   {:optional true} [:maybe [:sequential ::parameters.schema/parameter-with-value]]]]
   request]
  (some-> (data-apps/request-data-app request) (data-apps/check-card card-id))
  (let [card (api/check-404 (queries-rest.db/card card-id))]
    (when dashboard_id
      (api/read-check :model/Dashboard dashboard_id))
    (qp.card/process-query-for-card card :api
                                    :parameters   parameters
                                    :qp           qp.pivot/run-pivot-query
                                    :ignore-cache ignore_cache
                                    :dashboard-id dashboard_id
                                    :card-transform (when dashboard_id qp.dashboard/card-with-default-metric-dimension)
                                    :context      (if dashboard_id :dashboard :question))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:card-id/params/:param-key/values"
  "Fetch possible values of the parameter whose ID is `:param-key`.

    ;; fetch values for Card 1 parameter 'abc' that are possible
    GET /api/queries/1/params/abc/values"
  [{:keys [card-id param-key]} :- [:map {:closed true}
                                   [:card-id   ms/PositiveInt]
                                   [:param-key ::lib.schema.parameter/id]]
   _query-params
   _body]
  (binding [qp.perms/*param-values-query* true]
    (queries/card-param-values (api/read-check :model/Card card-id) param-key)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:card-id/params/:param-key/search/:query"
  "Fetch possible values of the parameter whose ID is `:param-key` that contain `:query`.

    ;; fetch values for Card 1 parameter 'abc' that contain 'Orange';
     GET /api/queries/1/params/abc/search/Orange

  Currently limited to first 1000 results."
  [{:keys [card-id param-key query]} :- [:map {:closed true}
                                         [:card-id   ms/PositiveInt]
                                         [:param-key ::lib.schema.parameter/id]
                                         [:query     ms/NonBlankString]]
   _query-params
   _body]
  (binding [qp.perms/*param-values-query* true]
    (queries/card-param-values (api/read-check :model/Card card-id) param-key query)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/params/:param-key/remapping"
  "Fetch the remapped value for a given value of the parameter with ID `:param-key`.

    ;; fetch the remapped value for Card 1 parameter 'abc' for value 100
    GET /api/queries/1/params/abc/remapping?value=100"
  [{:keys [id param-key]} :- [:map {:closed true}
                              [:id ::lib.schema.id/card]
                              [:param-key ::lib.schema.parameter/id]]
   {:keys [value]}        :- [:map {:closed true} [:value :string]]
   _body]
  (binding [qp.perms/*param-values-query* true]
    (-> (api/read-check :model/Card id)
        (queries/card-param-remapped-value param-key (codec/url-decode value)))))
