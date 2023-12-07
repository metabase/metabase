(ns metabase.api.card
  "/api/card endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.field :as api.field]
   [metabase.driver :as driver]
   [metabase.events :as events]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
   [metabase.models
    :refer [Card CardBookmark Collection Database PersistedInfo Table]]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.models.params :as params]
   [metabase.models.params.custom-values :as custom-values]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.query :as query]
   [metabase.models.query.permissions :as query-perms]
   [metabase.models.revision.last-edit :as last-edit]
   [metabase.models.timeline :as timeline]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.related :as related]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.sync.analyze.query-results :as qr]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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
  (t2/select Card, :archived false, {:order-by [[:%lower.name :asc]]}))

;; return Cards created by the current user
(defmethod cards-for-filter-option* :mine
  [_]
  (t2/select Card, :creator_id api/*current-user-id*, :archived false, {:order-by [[:%lower.name :asc]]}))

;; return all Cards bookmarked by the current user.
(defmethod cards-for-filter-option* :bookmarked
  [_]
  (let [cards (for [{{:keys [archived], :as card} :card} (t2/hydrate (t2/select [CardBookmark :card_id]
                                                                      :user_id api/*current-user-id*)
                                                                  :card)
                    :when                                 (not archived)]
                card)]
    (sort-by :name cards)))

;; Return all Cards belonging to Database with `database-id`.
(defmethod cards-for-filter-option* :database
  [_ database-id]
  (t2/select Card, :database_id database-id, :archived false, {:order-by [[:%lower.name :asc]]}))

;; Return all Cards belonging to `Table` with `table-id`.
(defmethod cards-for-filter-option* :table
  [_ table-id]
  (t2/select Card, :table_id table-id, :archived false, {:order-by [[:%lower.name :asc]]}))

;; Cards that have been archived.
(defmethod cards-for-filter-option* :archived
  [_]
  (t2/select Card, :archived true, {:order-by [[:%lower.name :asc]]}))

;; Cards that are using a given model.
(defmethod cards-for-filter-option* :using_model
  [_filter-option model-id]
  (->> (t2/select Card {:select [:c.*]
                        :from [[:report_card :m]]
                        :join [[:report_card :c] [:and
                                                  [:= :c.database_id :m.database_id]
                                                  [:or
                                                   [:like :c.dataset_query (format "%%card__%s%%" model-id)]
                                                   [:like :c.dataset_query (format "%%#%s%%" model-id)]]]]
                        :where [:and [:= :m.id model-id] [:not :c.archived]]})
       ;; now check if model-id really occurs as a card ID
       (filter (fn [card] (some #{model-id} (-> card :dataset_query query/collect-card-ids))))))

(defn- cards-for-filter-option [filter-option model-id-or-nil]
  (-> (apply cards-for-filter-option* filter-option (when model-id-or-nil [model-id-or-nil]))
      (t2/hydrate :creator :collection)))

;;; -------------------------------------------- Fetching a Card or Cards --------------------------------------------
(def ^:private card-filter-options
  "a valid card filter option."
  (map name (keys (methods cards-for-filter-option*))))

(api/defendpoint GET "/"
  "Get all the Cards. Option filter param `f` can be used to change the set of Cards that are returned; default is
  `all`, but other options include `mine`, `bookmarked`, `database`, `table`, `using_model` and `archived`. See
  corresponding implementation functions above for the specific behavior of each filterp option. :card_index:"
  [f model_id]
  {f        [:maybe (into [:enum] card-filter-options)]
   model_id [:maybe ms/PositiveInt]}
  (let [f (or (keyword f) :all)]
    (when (contains? #{:database :table :using_model} f)
      (api/checkp (integer? model_id) "model_id" (format "model_id is a required parameter when filter mode is '%s'"
                                                         (name f)))
      (case f
        :database    (api/read-check Database model_id)
        :table       (api/read-check Database (t2/select-one-fn :db_id Table, :id model_id))
        :using_model (api/read-check Card model_id)))
    (let [cards          (filter mi/can-read? (cards-for-filter-option f model_id))
          last-edit-info (:card (last-edit/fetch-last-edited-info {:card-ids (map :id cards)}))]
      (into []
            (map (fn [{:keys [id] :as card}]
                   (if-let [edit-info (get last-edit-info id)]
                     (assoc card :last-edit-info edit-info)
                     card)))
            cards))))

(defn hydrate-card-details
  "Adds additional information to a `Card` selected with toucan that is needed by the frontend. This should be the same information
  returned by all API endpoints where the card entity is cached (i.e. GET, PUT, POST) since the frontend replaces the Card
  it currently has with returned one -- See #4283"
  [{card-id :id :as card}]
  (span/with-span!
    {:name       "hydrate-card-details"
     :attributes {:card/id card-id}}
    (-> card
        (t2/hydrate :creator
                    :dashboard_count
                    :can_write
                    :average_query_time
                    :last_query_start
                    :parameter_usage_count
                    [:collection :is_personal]
                    [:moderation_reviews :moderator_details])
        (cond->                                             ; card
          (:dataset card) (t2/hydrate :persisted)))))

(api/defendpoint GET "/:id"
  "Get `Card` with ID."
  [id ignore_view]
  {id ms/PositiveInt
   ignore_view [:maybe :boolean]}
  (let [raw-card (t2/select-one Card :id id)
        card (-> raw-card
                 api/read-check
                 hydrate-card-details
                 ;; Cal 2023-11-27: why is last-edit-info hydrated differently for GET vs PUT and POST
                 (last-edit/with-last-edit-info :card)
                 collection.root/hydrate-root-collection)]
    (u/prog1 card
      (when-not ignore_view
        (events/publish-event! :event/card-read {:object <> :user-id api/*current-user-id*})))))

(defn- card-columns-from-names
  [card names]
  (when-let [names (set names)]
    (filter #(names (:name %)) (:result_metadata card))))

(defn- cols->kebab-case
  [cols]
  (map #(update-keys % u/->kebab-case-en) cols))

(defn- area-bar-line-series-are-compatible?
  [first-card second-card]
  (and (#{:area :line :bar} (:display second-card))
       (let [initial-dimensions (cols->kebab-case
                                  (card-columns-from-names
                                    first-card
                                    (get-in first-card [:visualization_settings :graph.dimensions])))
             new-dimensions     (cols->kebab-case
                                  (card-columns-from-names
                                    second-card
                                    (get-in second-card [:visualization_settings :graph.dimensions])))
             new-metrics        (cols->kebab-case
                                  (card-columns-from-names
                                    second-card
                                    (get-in second-card [:visualization_settings :graph.metrics])))]
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
  "Implementaiton of `fetch-compatible-series`.

  Provide `page-size` to limit the number of cards returned, it does not guaranteed to return exactly `page-size` cards.
  Use `fetch-compatible-series` for that."
  [card {:keys [query last-cursor page-size exclude-ids] :as _options}]
  (let [matching-cards  (t2/select Card
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

        compatible-cards (->> matching-cards
                              (filter mi/can-read?)
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

(api/defendpoint GET "/:id/series"
  "Fetches a list of comptatible series with the card with id `card_id`.

  - `last_cursor` with value is the id of the last card from the previous page to fetch the next page.
  - `query` to search card by name.
  - `exclude_ids` to filter out a list of card ids"
  [id last_cursor query exclude_ids]
  {id          int?
   last_cursor [:maybe ms/PositiveInt]
   query       [:maybe ms/NonBlankString]
   exclude_ids [:maybe [:fn
                        {:error/fn (fn [_ _] (deferred-tru "value must be a sequence of positive integers"))}
                        (fn [ids]
                          (every? pos-int? (api/parse-multi-values-param ids parse-long)))]]}
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
      :page-size   mw.offset-paging/*limit*})))

(api/defendpoint GET "/:id/timelines"
  "Get the timelines for card with ID. Looks up the collection the card is in and uses that."
  [id include start end]
  {id      ms/PositiveInt
   include [:maybe [:= "events"]]
   start   [:maybe ms/TemporalString]
   end     [:maybe ms/TemporalString]}
  (let [{:keys [collection_id] :as _card} (api/read-check Card id)]
    ;; subtlety here. timeline access is based on the collection at the moment so this check should be identical. If
    ;; we allow adding more timelines to a card in the future, we will need to filter on read-check and i don't think
    ;; the read-checks are particularly fast on multiple items
    (timeline/timelines-for-collection collection_id
                                       {:timeline/events? (= include "events")
                                        :events/start     (when start (u.date/parse start))
                                        :events/end       (when end (u.date/parse end))})))


;;; -------------------------------------------------- Saving Cards --------------------------------------------------

(defn check-data-permissions-for-query
  "Make sure the Current User has the appropriate *data* permissions to run `query`. We don't want Users saving Cards
  with queries they wouldn't be allowed to run!"
  [query]
  {:pre [(map? query)]}
  (when-not (query-perms/can-run-query? query)
    (let [required-perms (try
                           (query-perms/perms-set query :throw-exceptions? true)
                           (catch Throwable e
                             e))]
      (throw (ex-info (tru "You cannot save this Question because you do not have permissions to run its query.")
                      {:status-code    403
                       :query          query
                       :required-perms (if (instance? Throwable required-perms)
                                         :error
                                         required-perms)
                       :actual-perms   @api/*current-user-permissions-set*}
                      (when (instance? Throwable required-perms)
                        required-perms))))))

;;; ------------------------------------------------- Creating Cards -------------------------------------------------

(api/defendpoint POST "/"
  "Create a new `Card`."
  [:as {{:keys [collection_id collection_position dataset dataset_query description display name
                parameters parameter_mappings result_metadata visualization_settings cache_ttl], :as body} :body}]
  {name                   ms/NonBlankString
   dataset                [:maybe :boolean]
   dataset_query          ms/Map
   parameters             [:maybe [:sequential ms/Parameter]]
   parameter_mappings     [:maybe [:sequential ms/ParameterMapping]]
   description            [:maybe ms/NonBlankString]
   display                ms/NonBlankString
   visualization_settings ms/Map
   collection_id          [:maybe ms/PositiveInt]
   collection_position    [:maybe ms/PositiveInt]
   result_metadata        [:maybe qr/ResultsMetadata]
   cache_ttl              [:maybe ms/PositiveInt]}
  ;; check that we have permissions to run the query that we're trying to save
  (check-data-permissions-for-query dataset_query)
  ;; check that we have permissions for the collection we're trying to save this card to, if applicable
  (collection/check-write-perms-for-collection collection_id)
  (-> (card/create-card! body @api/*current-user*)
      hydrate-card-details
      (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*))))

(api/defendpoint POST "/:id/copy"
  "Copy a `Card`, with the new name 'Copy of _name_'"
  [id]
  {id [:maybe ms/PositiveInt]}
  (let [orig-card (api/read-check Card id)
        new-name  (str (trs "Copy of ") (:name orig-card))
        new-card  (assoc orig-card :name new-name)]
    (-> (card/create-card! new-card @api/*current-user*)
        hydrate-card-details
        (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))))

;;; ------------------------------------------------- Updating Cards -------------------------------------------------

(defn- check-allowed-to-modify-query
  "If the query is being modified, check that we have data permissions to run the query."
  [card-before-updates card-updates]
  (let [card-updates (m/update-existing card-updates :dataset_query mbql.normalize/normalize)]
    (when (api/column-will-change? :dataset_query card-before-updates card-updates)
      (check-data-permissions-for-query (:dataset_query card-updates)))))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding` or `embedding_params`. Embedding must be
  enabled."
  [card-before-updates card-updates]
  (when (or (api/column-will-change? :enable_embedding card-before-updates card-updates)
            (api/column-will-change? :embedding_params card-before-updates card-updates))
    (validation/check-embedding-enabled)
    (api/check-superuser)))

(api/defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [dataset_query description display name visualization_settings archived collection_id
                   collection_position enable_embedding embedding_params result_metadata parameters
                   cache_ttl dataset collection_preview]
            :as   card-updates} :body}]
  {id                     ms/PositiveInt
   name                   [:maybe ms/NonBlankString]
   parameters             [:maybe [:sequential ms/Parameter]]
   dataset_query          [:maybe ms/Map]
   dataset                [:maybe :boolean]
   display                [:maybe ms/NonBlankString]
   description            [:maybe :string]
   visualization_settings [:maybe ms/Map]
   archived               [:maybe :boolean]
   enable_embedding       [:maybe :boolean]
   embedding_params       [:maybe ms/EmbeddingParams]
   collection_id          [:maybe ms/PositiveInt]
   collection_position    [:maybe ms/PositiveInt]
   result_metadata        [:maybe qr/ResultsMetadata]
   cache_ttl              [:maybe ms/PositiveInt]
   collection_preview     [:maybe :boolean]}
  (let [card-before-update (t2/hydrate (api/write-check Card id)
                                       [:moderation_reviews :moderator_details])]
    ;; Do various permissions checks
    (doseq [f [collection/check-allowed-to-change-collection
               check-allowed-to-modify-query
               check-allowed-to-change-embedding]]
      (f card-before-update card-updates))
    ;; make sure we have the correct `result_metadata`
    (let [result-metadata-chan  (card/result-metadata-async {:original-query    (:dataset_query card-before-update)
                                                             :query             dataset_query
                                                             :metadata          result_metadata
                                                             :original-metadata (:result_metadata card-before-update)
                                                             :dataset?          (if (some? dataset)
                                                                                  dataset
                                                                                  (:dataset card-before-update))})
          card-updates          (merge card-updates
                                       (when dataset
                                         {:display :table}))
          metadata-timeout      (a/timeout card/metadata-sync-wait-ms)
          [fresh-metadata port] (a/alts!! [result-metadata-chan metadata-timeout])
          timed-out?            (= port metadata-timeout)
          card-updates          (cond-> card-updates
                                  (not timed-out?)
                                  (assoc :result_metadata fresh-metadata))]
      (u/prog1 (-> (card/update-card! {:card-before-update card-before-update
                                       :card-updates       card-updates
                                       :actor              @api/*current-user*})
                   hydrate-card-details
                   (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))
        (when timed-out?
          (log/info (trs "Metadata not available soon enough. Saving card {0} and asynchronously updating metadata" id))
          (card/schedule-metadata-saving result-metadata-chan <>))))))


;;; ------------------------------------------------- Deleting Cards -------------------------------------------------

;; TODO - Pretty sure this endpoint is not actually used any more, since Cards are supposed to get archived (via PUT
;;        /api/card/:id) instead of deleted.  Should we remove this?
(api/defendpoint DELETE "/:id"
  "Delete a Card. (DEPRECATED -- don't delete a Card anymore -- archive it instead.)"
  [id]
  {id ms/PositiveInt}
  (log/warn (tru "DELETE /api/card/:id is deprecated. Instead, change its `archived` value via PUT /api/card/:id."))
  (let [card (api/write-check Card id)]
    (t2/delete! Card :id id)
    (events/publish-event! :event/card-delete {:object card :user-id api/*current-user-id*}))
  api/generic-204-no-content)

;;; -------------------------------------------- Bulk Collections Update ---------------------------------------------

(defn- update-collection-positions!
  "For cards that have a position in the previous collection, add them to the end of the new collection, trying to
  preseve the order from the original collections. Note it's possible for there to be multiple collections
  (and thus duplicate collection positions) merged into this new collection. No special tie breaker logic for when
  that's the case, just use the order the DB returned it in"
  [new-collection-id-or-nil cards]
  ;; Sorting by `:collection_position` to ensure lower position cards are appended first
  (let [sorted-cards        (sort-by :collection_position cards)
        max-position-result (t2/select-one [Card [:%max.collection_position :max_position]]
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
            (t2/update! Card
                        (u/the-id card)
                        {:collection_position idx
                         :collection_id       new-collection-id-or-nil}))
          ;; These are reversed because of the classic issue when removing an item from array. If we remove an
          ;; item at index 1, everthing above index 1 will get decremented. By reversing our processing order we
          ;; can avoid changing the index of cards we haven't yet updated
          (reverse (range starting-position (+ (count sorted-cards) starting-position)))
          (reverse sorted-cards)))))

(defn- move-cards-to-collection! [new-collection-id-or-nil card-ids]
  ;; if moving to a collection, make sure we have write perms for it
  (when new-collection-id-or-nil
    (api/write-check Collection new-collection-id-or-nil))
  ;; for each affected card...
  (when (seq card-ids)
    (let [cards (t2/select [Card :id :collection_id :collection_position :dataset_query]
                  {:where [:and [:in :id (set card-ids)]
                                [:or [:not= :collection_id new-collection-id-or-nil]
                                  (when new-collection-id-or-nil
                                    [:= :collection_id nil])]]})] ; poisioned NULLs = ick
      ;; ...check that we have write permissions for it...
      (doseq [card cards]
        (api/write-check card))
      ;; ...and check that we have write permissions for the old collections if applicable
      (doseq [old-collection-id (set (filter identity (map :collection_id cards)))]
        (api/write-check Collection old-collection-id))

      ;; Ensure all of the card updates occur in a transaction. Read commited (the default) really isn't what we want
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
          (t2/update! (t2/table-name Card)
                      {:id [:in (set cards-without-position)]}
                      {:collection_id new-collection-id-or-nil}))))))

(api/defendpoint POST "/collections"
  "Bulk update endpoint for Card Collections. Move a set of `Cards` with `card_ids` into a `Collection` with
  `collection_id`, or remove them from any Collections by passing a `null` `collection_id`."
  [:as {{:keys [card_ids collection_id]} :body}]
  {card_ids      [:sequential ms/PositiveInt]
   collection_id [:maybe ms/PositiveInt]}
  (move-cards-to-collection! collection_id card_ids)
  {:status :ok})


;;; ------------------------------------------------ Running a Query -------------------------------------------------


(api/defendpoint POST "/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache dashboard_id collection_preview], :or {ignore_cache false dashboard_id nil}} :body}]
  {card-id            ms/PositiveInt
   ignore_cache       [:maybe :boolean]
   collection_preview [:maybe :boolean]
   dashboard_id       [:maybe ms/PositiveInt]}
  ;; TODO -- we should probably warn if you pass `dashboard_id`, and tell you to use the new
  ;;
  ;;    POST /api/dashboard/:dashboard-id/card/:card-id/query
  ;;
  ;; endpoint instead. Or error in that situtation? We're not even validating that you have access to this Dashboard.
  (qp.card/run-query-for-card-async
   card-id :api
   :parameters   parameters
   :ignore_cache ignore_cache
   :dashboard-id dashboard_id
   :context      (if collection_preview :collection :question)
   :middleware   {:process-viz-settings? false}))

(api/defendpoint POST "/:card-id/query/:export-format"
  "Run the query associated with a Card, and return its results as a file in the specified format.

  `parameters` should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint
  is normally used to power 'Download Results' buttons that use HTML `form` actions)."
  [card-id export-format :as {{:keys [parameters]} :params}]
  {card-id       ms/PositiveInt
   parameters    [:maybe ms/JSONString]
   export-format (into [:enum] api.dataset/export-formats)}
  (qp.card/run-query-for-card-async
   card-id export-format
   :parameters  (json/parse-string parameters keyword)
   :constraints nil
   :context     (api.dataset/export-format->context export-format)
   :middleware  {:process-viz-settings?  true
                 :skip-results-metadata? true
                 :ignore-cached-results? true
                 :format-rows?           false
                 :js-int-to-string?      false}))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api/defendpoint POST "/:card-id/public_link"
  "Generate publicly-accessible links for this Card. Returns UUID to be used in public links. (If this Card has
  already been shared, it will return the existing public link rather than creating a new one.)  Public sharing must
  be enabled."
  [card-id]
  {card-id ms/PositiveInt}
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check Card card-id))
  (let [{existing-public-uuid :public_uuid} (t2/select-one [Card :public_uuid] :id card-id)]
    {:uuid (or existing-public-uuid
               (u/prog1 (str (random-uuid))
                 (t2/update! Card card-id
                             {:public_uuid       <>
                              :made_public_by_id api/*current-user-id*})))}))

(api/defendpoint DELETE "/:card-id/public_link"
  "Delete the publicly-accessible link to this Card."
  [card-id]
  {card-id ms/PositiveInt}
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-exists? Card :id card-id, :public_uuid [:not= nil])
  (t2/update! Card card-id
              {:public_uuid       nil
               :made_public_by_id nil})
  {:status 204, :body nil})

(api/defendpoint GET "/public"
  "Fetch a list of Cards with public UUIDs. These cards are publicly-accessible *if* public sharing is enabled."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (t2/select [Card :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(api/defendpoint GET "/embeddable"
  "Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-embedding-enabled)
  (t2/select [Card :name :id], :enable_embedding true, :archived false))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one Card :id id) api/read-check related/related))

(api/defendpoint POST "/related"
  "Return related entities for an ad-hoc query."
  [:as {query :body}]
  (related/related (query/adhoc-query query)))

(api/defendpoint POST "/pivot/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache]
                 :or   {ignore_cache false}} :body}]
  {card-id      ms/PositiveInt
   ignore_cache [:maybe :boolean]}
  (qp.card/run-query-for-card-async card-id :api
                            :parameters parameters,
                            :qp-runner qp.pivot/run-pivot-query
                            :ignore_cache ignore_cache))

(api/defendpoint POST "/:card-id/persist"
  "Mark the model (card) as persisted. Runs the query and saves it to the database backing the card and hot swaps this
  query in place of the model's query."
  [card-id]
  {card-id ms/PositiveInt}
  (premium-features/assert-has-feature :cache-granular-controls (tru "Granular cache controls"))
  (api/let-404 [{:keys [dataset database_id] :as card} (t2/select-one Card :id card-id)]
    (let [database (t2/select-one Database :id database_id)]
      (api/write-check database)
      (when-not (driver/database-supports? (:engine database)
                                           :persist-models database)
        (throw (ex-info (tru "Database does not support persisting")
                        {:status-code 400
                         :database    (:name database)})))
      (when-not (driver/database-supports? (:engine database)
                                           :persist-models-enabled database)
        (throw (ex-info (tru "Persisting models not enabled for database")
                        {:status-code 400
                         :database    (:name database)})))
      (when-not dataset
        (throw (ex-info (tru "Card is not a model") {:status-code 400})))
      (when-let [persisted-info (persisted-info/turn-on-model! api/*current-user-id* card)]
        (task.persist-refresh/schedule-refresh-for-individual! persisted-info))
      api/generic-204-no-content)))

(api/defendpoint POST "/:card-id/refresh"
  "Refresh the persisted model caching `card-id`."
  [card-id]
  {card-id ms/PositiveInt}
  (api/let-404 [card           (t2/select-one Card :id card-id)
                persisted-info (t2/select-one PersistedInfo :card_id card-id)]
    (when (not (:dataset card))
      (throw (ex-info (trs "Cannot refresh a non-model question") {:status-code 400})))
    (when (:archived card)
      (throw (ex-info (trs "Cannot refresh an archived model") {:status-code 400})))
    (api/write-check (t2/select-one Database :id (:database_id persisted-info)))
    (task.persist-refresh/schedule-refresh-for-individual! persisted-info)
    api/generic-204-no-content))

(api/defendpoint POST "/:card-id/unpersist"
  "Unpersist this model. Deletes the persisted table backing the model and all queries after this will use the card's
  query rather than the saved version of the query."
  [card-id]
  {card-id ms/PositiveInt}
  (premium-features/assert-has-feature :cache-granular-controls (tru "Granular cache controls"))
  (api/let-404 [_card (t2/select-one Card :id card-id)]
    (api/let-404 [persisted-info (t2/select-one PersistedInfo :card_id card-id)]
      (api/write-check (t2/select-one Database :id (:database_id persisted-info)))
      (persisted-info/mark-for-pruning! {:id (:id persisted-info)} "off")
      api/generic-204-no-content)))

(defn mapping->field-values
  "Get param values for the \"old style\" parameters. This mimic's the api/dashboard version except we don't have
  chain-filter issues or dashcards to worry about."
  [card param query]
  (when-let [field-clause (params/param-target->field-clause (:target param) card)]
    (when-let [field-id (mbql.u/match-one field-clause [:field (id :guard integer?) _] id)]
      (api.field/search-values-from-field-id field-id query))))

(mu/defn param-values
  "Fetch values for a parameter that contain `query`. If `query` is nil or not provided, return all values.

  The source of values could be:
  - static-list: user defined values list
  - card: values is result of running a card"
  ([card param-key]
   (param-values card param-key nil))

  ([card      :- ms/Map
    param-key :- ms/NonBlankString
    query     :- [:maybe ms/NonBlankString]]
   (let [param (get (m/index-by :id (or (seq (:parameters card))
                                        ;; some older cards or cards in e2e just use the template tags on native queries
                                        (card/template-tag-parameters card)))
                    param-key)]
     (when-not param
       (throw (ex-info (tru "Card does not have a parameter with the ID {0}" (pr-str param-key))
                       {:status-code 400})))
     (custom-values/parameter->values param query (fn [] (mapping->field-values card param query))))))

(api/defendpoint GET "/:card-id/params/:param-key/values"
  "Fetch possible values of the parameter whose ID is `:param-key`.

    ;; fetch values for Card 1 parameter 'abc' that are possible
    GET /api/card/1/params/abc/values"
  [card-id param-key]
  {card-id   ms/PositiveInt
   param-key ms/NonBlankString}
  (param-values (api/read-check Card card-id) param-key))

(api/defendpoint GET "/:card-id/params/:param-key/search/:query"
  "Fetch possible values of the parameter whose ID is `:param-key` that contain `:query`.

    ;; fetch values for Card 1 parameter 'abc' that contain 'Orange';
     GET /api/card/1/params/abc/search/Orange

  Currently limited to first 1000 results."
  [card-id param-key query]
  {card-id   ms/PositiveInt
   param-key ms/NonBlankString
   query     ms/NonBlankString}
  (param-values (api/read-check Card card-id) param-key query))

(defn- from-csv!
  "This helper function exists to make testing the POST /api/card/from-csv endpoint easier."
  [{:keys [collection-id filename file]}]
  (try
    (let [model (upload/upload-csv! {:collection-id collection-id
                                     :filename      filename
                                     :file          file
                                     :schema-name   (public-settings/uploads-schema-name)
                                     :table-prefix  (public-settings/uploads-table-prefix)
                                     :db-id         (or (public-settings/uploads-database-id)
                                                        (throw (ex-info (tru "The uploads database is not configured.")
                                                                        {:status-code 422})))})]
      {:status 200
       :body   (:id model)})
    (catch Throwable e
      {:status (or (-> e ex-data :status-code)
                   500)
       :body   {:message (or (ex-message e)
                             (tru "There was an error uploading the file"))}})
    (finally (io/delete-file file :silently))))

(api/defendpoint ^:multipart POST "/from-csv"
  "Create a table and model populated with the values from the attached CSV. Returns the model ID if successful."
  [:as {raw-params :params}]
  ;; parse-long returns nil with "root" as the collection ID, which is what we want anyway
  (from-csv! {:collection-id (parse-long (get raw-params "collection_id"))
              :filename      (get-in raw-params ["file" :filename])
              :file          (get-in raw-params ["file" :tempfile])}))

(api/define-routes)
