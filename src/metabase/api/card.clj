(ns metabase.api.card
  "/api/card endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.core.async :as a]
   [clojure.data :as data]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.field :as api.field]
   [metabase.api.timeline :as api.timeline]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
   [metabase.models
    :refer [Card
            CardBookmark
            Collection
            Database
            PersistedInfo
            Pulse
            Table
            ViewLog]]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.moderation-review :as moderation-review]
   [metabase.models.params :as params]
   [metabase.models.params.custom-values :as custom-values]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.pulse :as pulse]
   [metabase.models.query :as query]
   [metabase.models.query.permissions :as query-perms]
   [metabase.models.revision.last-edit :as last-edit]
   [metabase.models.timeline :as timeline]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.async :as qp.async]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.util :as qp.util]
   [metabase.related :as related]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.sync :as sync]
   [metabase.sync.analyze.query-results :as qr]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)
   (java.util UUID)))

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
  (let [cards (for [{{:keys [archived], :as card} :card} (hydrate (t2/select [CardBookmark :card_id]
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

(s/defn ^:private cards-with-ids :- (s/maybe [(mi/InstanceOf Card)])
  "Return unarchived Cards with `card-ids`.
  Make sure cards are returned in the same order as `card-ids`; `[in card-ids]` won't preserve the order."
  [card-ids :- [su/IntGreaterThanZero]]
  (when (seq card-ids)
    (let [card-id->card (m/index-by :id (t2/select Card, :id [:in (set card-ids)], :archived false))]
      (filter identity (map card-id->card card-ids)))))

;; Return the 10 Cards most recently viewed by the current user, sorted by how recently they were viewed.
(defmethod cards-for-filter-option* :recent
  [_]
  (cards-with-ids (map :model_id (t2/select [ViewLog :model_id [:%max.timestamp :max]]
                                   :model   "card"
                                   :user_id api/*current-user-id*
                                   {:group-by [:model_id]
                                    :order-by [[:max :desc]]
                                    :limit    10}))))

;; All Cards, sorted by popularity (the total number of times they are viewed in `ViewLogs`). (yes, this isn't
;; actually filtering anything, but for the sake of simplicitiy it is included amongst the filter options for the time
;; being).
(defmethod cards-for-filter-option* :popular
  [_]
  (cards-with-ids (map :model_id (t2/select [ViewLog :model_id [:%count.* :count]]
                                   :model "card"
                                   {:group-by [:model_id]
                                    :order-by [[:count :desc]]}))))

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
      (hydrate :creator :collection)))

;;; -------------------------------------------- Fetching a Card or Cards --------------------------------------------

(def ^:private CardFilterOption
  "Schema for a valid card filter option."
  (apply s/enum (map name (keys (methods cards-for-filter-option*)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/"
  "Get all the Cards. Option filter param `f` can be used to change the set of Cards that are returned; default is
  `all`, but other options include `mine`, `bookmarked`, `database`, `table`, `recent`, `popular`, :using_model
  and `archived`. See corresponding implementation functions above for the specific behavior of each filter
  option. :card_index:"
  [f model_id]
  {f        (s/maybe CardFilterOption)
   model_id (s/maybe su/IntGreaterThanZero)}
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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:id"
  "Get `Card` with ID."
  [id ignore_view]
  (let [raw-card (t2/select-one Card :id id)
        card (-> raw-card
                 (hydrate :creator
                          :dashboard_count
                          :parameter_usage_count
                          :can_write
                          :average_query_time
                          :last_query_start
                          :collection [:moderation_reviews :moderator_details])
                 (cond-> ;; card
                   (:dataset raw-card) (hydrate :persisted))
                 api/read-check
                 (last-edit/with-last-edit-info :card))]
    (u/prog1 card
      (when-not (Boolean/parseBoolean ignore_view)
        (events/publish-event! :card-read (assoc <> :actor_id api/*current-user-id*))))))

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
           (not= (lib.types.isa/date? (first initial-dimensions))
                 (lib.types.isa/date? (first new-dimensions)))
           false

           ;; both or neither primary dimension must be numeric
           ;; a timestamp field is both date and number so don't enforce the condition if both fields are dates; see #2811
           (and (not= (lib.types.isa/numeric? (first initial-dimensions))
                      (lib.types.isa/numeric? (first new-dimensions)))
                (not (and
                      (lib.types.isa/date? (first initial-dimensions))
                      (lib.types.isa/date? (first new-dimensions)))))
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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:id/timelines"
  "Get the timelines for card with ID. Looks up the collection the card is in and uses that."
  [id include start end]
  {include (s/maybe api.timeline/Include)
   start   (s/maybe su/TemporalString)
   end     (s/maybe su/TemporalString)}
  (let [{:keys [collection_id] :as _card} (api/read-check Card id)]
    ;; subtlety here. timeline access is based on the collection at the moment so this check should be identical. If
    ;; we allow adding more timelines to a card in the future, we will need to filter on read-check and i don't think
    ;; the read-checks are particularly fast on multiple items
    (timeline/timelines-for-collection collection_id
                                       {:timeline/events? (= include "events")
                                        :events/start     (when start (u.date/parse start))
                                        :events/end       (when end (u.date/parse end))})))


;;; -------------------------------------------------- Saving Cards --------------------------------------------------

(s/defn ^:private result-metadata-async :- ManyToManyChannel
  "Return a channel of metadata for the passed in `query`. Takes the `original-query` so it can determine if existing
  `metadata` might still be valid. Takes `dataset?` since existing metadata might need to be \"blended\" into the
  fresh metadata to preserve metadata edits from the dataset.

  Note this condition is possible for new cards and edits to cards. New cards can be created from existing cards by
  copying, and they could be datasets, have edited metadata that needs to be blended into a fresh run.

  This is also complicated because everything is optional, so we cannot assume the client will provide metadata and
  might need to save a metadata edit, or might need to use db-saved metadata on a modified dataset."
  [{:keys [original-query query metadata original-metadata dataset?]}]
  (let [valid-metadata? (and metadata (nil? (s/check qr/ResultsMetadata metadata)))]
    (cond
      (or
       ;; query didn't change, preserve existing metadata
       (and (= (mbql.normalize/normalize original-query)
               (mbql.normalize/normalize query))
            valid-metadata?)
       ;; only sent valid metadata in the edit. Metadata might be the same, might be different. We save in either case
       (and (nil? query)
            valid-metadata?))
      (do
        (log/debug (trs "Reusing provided metadata"))
        (a/to-chan! [metadata]))

      ;; frontend always sends query. But sometimes programatic don't (cypress, API usage). Returning an empty channel
      ;; means the metadata won't be updated at all.
      (nil? query)
      (do
        (log/debug (trs "No query provided so not querying for metadata"))
        (doto (a/chan) a/close!))

      ;; datasets need to incorporate the metadata either passed in or already in the db. Query has changed so we
      ;; re-run and blend the saved into the new metadata
      (and dataset? (or valid-metadata? (seq original-metadata)))
      (do
       (log/debug (trs "Querying for metadata and blending model metadata"))
       (a/go (let [metadata' (if valid-metadata?
                               (map mbql.normalize/normalize-source-metadata metadata)
                               original-metadata)
                   fresh     (a/<! (qp.async/result-metadata-for-query-async query))]
               (qp.util/combine-metadata fresh metadata'))))
      :else
      ;; compute fresh
      (do
        (log/debug (trs "Querying for metadata"))
        (qp.async/result-metadata-for-query-async query)))))

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

(def ^:private metadata-sync-wait-ms
  "Duration in milliseconds to wait for the metadata before saving the card without the metadata. That metadata will be
saved later when it is ready."
  1500)

(def ^:private metadata-async-timeout-ms
  "Duration in milliseconds to wait for the metadata before abandoning the asynchronous metadata saving. Default is 15
  minutes."
  (u/minutes->ms 15))

(defn- schedule-metadata-saving
  "Save metadata when (and if) it is ready. Takes a chan that will eventually return metadata. Waits up
  to [[metadata-async-timeout-ms]] for the metadata, and then saves it if the query of the card has not changed."
  [result-metadata-chan card]
  (a/go
    (let [timeoutc        (a/timeout metadata-async-timeout-ms)
          [metadata port] (a/alts! [result-metadata-chan timeoutc])
          id              (:id card)]
      (cond (= port timeoutc)
            (do (a/close! result-metadata-chan)
                (log/info (trs "Metadata not ready in {0} minutes, abandoning"
                               (long (/ metadata-async-timeout-ms 1000 60)))))

            (not (seq metadata))
            (log/info (trs "Not updating metadata asynchronously for card {0} because no metadata"
                           id))
            :else
            (future
              (let [current-query (t2/select-one-fn :dataset_query Card :id id)]
                (if (= (:dataset_query card) current-query)
                  (do (t2/update! Card id {:result_metadata metadata})
                      (log/info (trs "Metadata updated asynchronously for card {0}" id)))
                  (log/info (trs "Not updating metadata asynchronously for card {0} because query has changed"
                                 id)))))))))

(defn create-card!
  "Create a new Card. Metadata will be fetched off thread. If the metadata takes longer than [[metadata-sync-wait-ms]]
  the card will be saved without metadata and it will be saved to the card in the future when it is ready.

  Dispatches the `:card-create` event unless `delay-event?` is true. Useful for when many cards are created in a
  transaction and work in the `:card-create` event cannot proceed because the cards would not be visible outside of
  the transaction yet. If you pass true here it is important to call the event after the cards are successfully
  created."
  ([card] (create-card! card false))
  ([{:keys [dataset_query result_metadata dataset parameters parameter_mappings], :as card-data} delay-event?]
   ;; `zipmap` instead of `select-keys` because we want to get `nil` values for keys that aren't present. Required by
   ;; `api/maybe-reconcile-collection-position!`
   (let [data-keys            [:dataset_query :description :display :name :visualization_settings
                               :parameters :parameter_mappings :collection_id :collection_position :cache_ttl]
         card-data            (assoc (zipmap data-keys (map card-data data-keys))
                                     :creator_id api/*current-user-id*
                                     :dataset (boolean (:dataset card-data))
                                     :parameters (or parameters [])
                                     :parameter_mappings (or parameter_mappings []))
         result-metadata-chan (result-metadata-async {:query    dataset_query
                                                      :metadata result_metadata
                                                      :dataset? dataset})
         metadata-timeout     (a/timeout metadata-sync-wait-ms)
         [metadata port]      (a/alts!! [result-metadata-chan metadata-timeout])
         timed-out?           (= port metadata-timeout)
         card                 (t2/with-transaction [_conn]
                               ;; Adding a new card at `collection_position` could cause other cards in this
                               ;; collection to change position, check that and fix it if needed
                               (api/maybe-reconcile-collection-position! card-data)
                               (first (t2/insert-returning-instances! Card (cond-> card-data
                                                                             (and metadata (not timed-out?))
                                                                             (assoc :result_metadata metadata)))))]
     (when-not delay-event?
       (events/publish-event! :card-create card))
     (when timed-out?
       (log/info (trs "Metadata not available soon enough. Saving new card and asynchronously updating metadata")))
     ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently has with
     ;; returned one -- See #4283
     (u/prog1 (-> card
                  (hydrate :creator
                           :dashboard_count
                           :can_write
                           :average_query_time
                           :last_query_start
                           :collection [:moderation_reviews :moderator_details])
                  (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))
       (when timed-out?
         (schedule-metadata-saving result-metadata-chan <>))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/"
  "Create a new `Card`."
  [:as {{:keys [collection_id collection_position dataset_query description display name
                parameters parameter_mappings result_metadata visualization_settings cache_ttl], :as body} :body}]
  {name                   su/NonBlankString
   dataset_query          su/Map
   parameters             (s/maybe [su/Parameter])
   parameter_mappings     (s/maybe [su/ParameterMapping])
   description            (s/maybe su/NonBlankString)
   display                su/NonBlankString
   visualization_settings su/Map
   collection_id          (s/maybe su/IntGreaterThanZero)
   collection_position    (s/maybe su/IntGreaterThanZero)
   result_metadata        (s/maybe qr/ResultsMetadata)
   cache_ttl              (s/maybe su/IntGreaterThanZero)}
  ;; check that we have permissions to run the query that we're trying to save
  (check-data-permissions-for-query dataset_query)
  ;; check that we have permissions for the collection we're trying to save this card to, if applicable
  (collection/check-write-perms-for-collection collection_id)
  (create-card! body))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:id/copy"
  "Copy a `Card`, with the new name 'Copy of _name_'"
  [id]
  {id (s/maybe su/IntGreaterThanZero)}
  (let [orig-card (api/read-check Card id)
        new-name  (str (trs "Copy of ") (:name orig-card))
        new-card  (assoc orig-card :name new-name)]
    (create-card! new-card)))


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

(defn- publish-card-update!
  "Publish an event appropriate for the update(s) done to this CARD (`:card-update`, or archiving/unarchiving
  events)."
  [card archived?]
  (let [event (cond
                ;; card was archived
                (and archived?
                     (not (:archived card))) :card-archive
                ;; card was unarchived
                (and (false? archived?)
                     (:archived card))       :card-unarchive
                :else                        :card-update)]
    (events/publish-event! event (assoc card :actor_id api/*current-user-id*))))

(defn- card-archived? [old-card new-card]
  (and (not (:archived old-card))
       (:archived new-card)))

(defn- line-area-bar? [display]
  (contains? #{:line :area :bar} display))

(defn- progress? [display]
  (= :progress display))

(defn- allows-rows-alert? [display]
  (not (contains? #{:line :bar :area :progress} display)))

(defn- display-change-broke-alert?
  "Alerts no longer make sense when the kind of question being alerted on significantly changes. Setting up an alert
  when a time series query reaches 10 is no longer valid if the question switches from a line graph to a table. This
  function goes through various scenarios that render an alert no longer valid"
  [{old-display :display} {new-display :display}]
  (when-not (= old-display new-display)
    (or
     ;; Did the alert switch from a table type to a line/bar/area/progress graph type?
     (and (allows-rows-alert? old-display)
          (or (line-area-bar? new-display)
              (progress? new-display)))
     ;; Switching from a line/bar/area to another type that is not those three invalidates the alert
     (and (line-area-bar? old-display)
          (not (line-area-bar? new-display)))
     ;; Switching from a progress graph to anything else invalidates the alert
     (and (progress? old-display)
          (not (progress? new-display))))))

(defn- goal-missing?
  "If we had a goal before, and now it's gone, the alert is no longer valid"
  [old-card new-card]
  (and
   (get-in old-card [:visualization_settings :graph.goal_value])
   (not (get-in new-card [:visualization_settings :graph.goal_value]))))

(defn- multiple-breakouts?
  "If there are multiple breakouts and a goal, we don't know which breakout to compare to the goal, so it invalidates
  the alert"
  [{:keys [display] :as new-card}]
  (and (get-in new-card [:visualization_settings :graph.goal_value])
       (or (line-area-bar? display)
           (progress? display))
       (< 1 (count (get-in new-card [:dataset_query :query :breakout])))))

(defn- delete-alert-and-notify!
  "Removes all of the alerts and notifies all of the email recipients of the alerts change via `NOTIFY-FN!`"
  [notify-fn! alerts]
  (t2/delete! Pulse :id [:in (map :id alerts)])
  (doseq [{:keys [channels] :as alert} alerts
          :let [email-channel (m/find-first #(= :email (:channel_type %)) channels)]]
    (doseq [recipient (:recipients email-channel)]
      (notify-fn! alert recipient @api/*current-user*))))

(defn delete-alert-and-notify-archived!
  "Removes all alerts and will email each recipient letting them know"
  [alerts]
  (delete-alert-and-notify! messages/send-alert-stopped-because-archived-email! alerts))

(defn- delete-alert-and-notify-changed! [alerts]
  (delete-alert-and-notify! messages/send-alert-stopped-because-changed-email! alerts))

(defn- delete-alerts-if-needed! [old-card {card-id :id :as new-card}]
  ;; If there are alerts, we need to check to ensure the card change doesn't invalidate the alert
  (when-let [alerts (seq (pulse/retrieve-alerts-for-cards {:card-ids [card-id]}))]
    (cond

      (card-archived? old-card new-card)
      (delete-alert-and-notify-archived! alerts)

      (or (display-change-broke-alert? old-card new-card)
          (goal-missing? old-card new-card)
          (multiple-breakouts? new-card))
      (delete-alert-and-notify-changed! alerts)

      ;; The change doesn't invalidate the alert, do nothing
      :else
      nil)))

(defn- card-is-verified?
  "Return true if card is verified, false otherwise. Assumes that moderation reviews are ordered so that the most recent
  is the first. This is the case from the hydration function for moderation_reviews."
  [card]
  (-> card :moderation_reviews first :status #{"verified"} boolean))

(defn- changed?
  "Return whether there were any changes in the objects at the keys for `consider`.

  returns false because changes to collection_id are ignored:
  (changed? #{:description}
            {:collection_id 1 :description \"foo\"}
            {:collection_id 2 :description \"foo\"})

  returns true:
  (changed? #{:description}
            {:collection_id 1 :description \"foo\"}
            {:collection_id 2 :description \"diff\"})"
  [consider card-before updates]
  ;; have to ignore keyword vs strings over api. `{:type :query}` vs `{:type "query"}`
  (let [prepare              (fn prepare [card] (walk/prewalk (fn [x] (if (keyword? x)
                                                                        (name x)
                                                                        x))
                                                              card))
        before               (prepare (select-keys card-before consider))
        after                (prepare (select-keys updates consider))
        [_ changes-in-after] (data/diff before after)]
    (boolean (seq changes-in-after))))



(def card-compare-keys
  "When comparing a card to possibly unverify, only consider these keys as changing something 'important' about the
  query."
  #{:table_id
    :database_id
    :query_type ;; these first three may not even be changeable
    :dataset_query})

(defn- update-card!
  "Update a Card. Metadata is fetched asynchronously. If it is ready before [[metadata-sync-wait-ms]] elapses it will be
  included, otherwise the metadata will be saved to the database asynchronously."
  [{:keys [id], :as card-before-update} {:keys [archived], :as card-updates}]
  ;; don't block our precious core.async thread, run the actual DB updates on a separate thread
  (t2/with-transaction [_conn]
   (api/maybe-reconcile-collection-position! card-before-update card-updates)

   (when (and (card-is-verified? card-before-update)
              (changed? card-compare-keys card-before-update card-updates))
     ;; this is an enterprise feature but we don't care if enterprise is enabled here. If there is a review we need
     ;; to remove it regardless if enterprise edition is present at the moment.
     (moderation-review/create-review! {:moderated_item_id   id
                                        :moderated_item_type "card"
                                        :moderator_id        api/*current-user-id*
                                        :status              nil
                                        :text                (tru "Unverified due to edit")}))
   ;; ok, now save the Card
   (t2/update! Card id
     ;; `collection_id` and `description` can be `nil` (in order to unset them). Other values should only be
     ;; modified if they're passed in as non-nil
     (u/select-keys-when card-updates
       :present #{:collection_id :collection_position :description :cache_ttl :dataset}
       :non-nil #{:dataset_query :display :name :visualization_settings :archived :enable_embedding
                  :parameters :parameter_mappings :embedding_params :result_metadata :collection_preview})))
    ;; Fetch the updated Card from the DB

  (let [card (t2/select-one Card :id id)]
    (delete-alerts-if-needed! card-before-update card)
    (publish-card-update! card archived)
    ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently
    ;; has with returned one -- See #4142
    (-> card
        (hydrate :creator
                 :dashboard_count
                 :can_write
                 :average_query_time
                 :last_query_start
                 :collection [:moderation_reviews :moderator_details])
        (cond-> ;; card
          (:dataset card) (hydrate :persisted))
        (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [dataset_query description display name visualization_settings archived collection_id
                   collection_position enable_embedding embedding_params result_metadata parameters
                   cache_ttl dataset collection_preview]
            :as   card-updates} :body}]
  {name                   (s/maybe su/NonBlankString)
   parameters             (s/maybe [su/Parameter])
   dataset_query          (s/maybe su/Map)
   dataset                (s/maybe s/Bool)
   display                (s/maybe su/NonBlankString)
   description            (s/maybe s/Str)
   visualization_settings (s/maybe su/Map)
   archived               (s/maybe s/Bool)
   enable_embedding       (s/maybe s/Bool)
   embedding_params       (s/maybe su/EmbeddingParams)
   collection_id          (s/maybe su/IntGreaterThanZero)
   collection_position    (s/maybe su/IntGreaterThanZero)
   result_metadata        (s/maybe qr/ResultsMetadata)
   cache_ttl              (s/maybe su/IntGreaterThanZero)
   collection_preview     (s/maybe s/Bool)}
  (let [card-before-update (hydrate (api/write-check Card id)
                                    [:moderation_reviews :moderator_details])]
    ;; Do various permissions checks
    (doseq [f [collection/check-allowed-to-change-collection
               check-allowed-to-modify-query
               check-allowed-to-change-embedding]]
      (f card-before-update card-updates))
    ;; make sure we have the correct `result_metadata`
    (let [result-metadata-chan  (result-metadata-async {:original-query    (:dataset_query card-before-update)
                                                        :query             dataset_query
                                                        :metadata          result_metadata
                                                        :original-metadata (:result_metadata card-before-update)
                                                        :dataset?          (if (some? dataset)
                                                                             dataset
                                                                             (:dataset card-before-update))})
          card-updates          (merge card-updates
                                       (when dataset
                                         {:display :table}))
          metadata-timeout      (a/timeout metadata-sync-wait-ms)
          [fresh-metadata port] (a/alts!! [result-metadata-chan metadata-timeout])
          timed-out?            (= port metadata-timeout)
          card-updates          (cond-> card-updates
                                  (not timed-out?)
                                  (assoc :result_metadata fresh-metadata))]
      (u/prog1 (update-card! card-before-update card-updates)
        (when timed-out?
          (log/info (trs "Metadata not available soon enough. Saving card {0} and asynchronously updating metadata" id))
          (schedule-metadata-saving result-metadata-chan <>))))))


;;; ------------------------------------------------- Deleting Cards -------------------------------------------------

;; TODO - Pretty sure this endpoint is not actually used any more, since Cards are supposed to get archived (via PUT
;;        /api/card/:id) instead of deleted.  Should we remove this?
#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema DELETE "/:id"
  "Delete a Card. (DEPRECATED -- don't delete a Card anymore -- archive it instead.)"
  [id]
  (log/warn (tru "DELETE /api/card/:id is deprecated. Instead, change its `archived` value via PUT /api/card/:id."))
  (let [card (api/write-check Card id)]
    (t2/delete! Card :id id)
    (events/publish-event! :card-delete (assoc card :actor_id api/*current-user-id*)))
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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/collections"
  "Bulk update endpoint for Card Collections. Move a set of `Cards` with CARD_IDS into a `Collection` with
  COLLECTION_ID, or remove them from any Collections by passing a `null` COLLECTION_ID."
  [:as {{:keys [card_ids collection_id]} :body}]
  {card_ids [su/IntGreaterThanZero], collection_id (s/maybe su/IntGreaterThanZero)}
  (move-cards-to-collection! collection_id card_ids)
  {:status :ok})


;;; ------------------------------------------------ Running a Query -------------------------------------------------


#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache dashboard_id collection_preview], :or {ignore_cache false dashboard_id nil}} :body}]
  {ignore_cache (s/maybe s/Bool)
   collection_preview (s/maybe s/Bool)
   dashboard_id (s/maybe su/IntGreaterThanZero)}
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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:card-id/query/:export-format"
  "Run the query associated with a Card, and return its results as a file in the specified format.

  `parameters` should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint
  is normally used to power 'Download Results' buttons that use HTML `form` actions)."
  [card-id export-format :as {{:keys [parameters]} :params}]
  {parameters    (s/maybe su/JSONString)
   export-format api.dataset/ExportFormat}
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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:card-id/public_link"
  "Generate publicly-accessible links for this Card. Returns UUID to be used in public links. (If this Card has
  already been shared, it will return the existing public link rather than creating a new one.)  Public sharing must
  be enabled."
  [card-id]
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check Card card-id))
  (let [{existing-public-uuid :public_uuid} (t2/select-one [Card :public_uuid] :id card-id)]
    {:uuid (or existing-public-uuid
               (u/prog1 (str (UUID/randomUUID))
                 (t2/update! Card card-id
                             {:public_uuid       <>
                              :made_public_by_id api/*current-user-id*})))}))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema DELETE "/:card-id/public_link"
  "Delete the publicly-accessible link to this Card."
  [card-id]
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-exists? Card :id card-id, :public_uuid [:not= nil])
  (t2/update! Card card-id
              {:public_uuid       nil
               :made_public_by_id nil})
  {:status 204, :body nil})

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/public"
  "Fetch a list of Cards with public UUIDs. These cards are publicly-accessible *if* public sharing is enabled."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (t2/select [Card :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/embeddable"
  "Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-embedding-enabled)
  (t2/select [Card :name :id], :enable_embedding true, :archived false))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:id/related"
  "Return related entities."
  [id]
  (-> (t2/select-one Card :id id) api/read-check related/related))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/related"
  "Return related entities for an ad-hoc query."
  [:as {query :body}]
  (related/related (query/adhoc-query query)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/pivot/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache]
                 :or   {ignore_cache false}} :body}]
  {ignore_cache (s/maybe s/Bool)}
  (qp.card/run-query-for-card-async card-id :api
                            :parameters parameters,
                            :qp-runner qp.pivot/run-pivot-query
                            :ignore_cache ignore_cache))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:card-id/persist"
  "Mark the model (card) as persisted. Runs the query and saves it to the database backing the card and hot swaps this
  query in place of the model's query."
  [card-id]
  {card-id su/IntGreaterThanZero}
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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:card-id/refresh"
  "Refresh the persisted model caching `card-id`."
  [card-id]
  {card-id su/IntGreaterThanZero}
  (api/let-404 [card           (t2/select-one Card :id card-id)
                persisted-info (t2/select-one PersistedInfo :card_id card-id)]
    (when (not (:dataset card))
      (throw (ex-info (trs "Cannot refresh a non-model question") {:status-code 400})))
    (when (:archived card)
      (throw (ex-info (trs "Cannot refresh an archived model") {:status-code 400})))
    (api/write-check (t2/select-one Database :id (:database_id persisted-info)))
    (task.persist-refresh/schedule-refresh-for-individual! persisted-info)
    api/generic-204-no-content))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:card-id/unpersist"
  "Unpersist this model. Deletes the persisted table backing the model and all queries after this will use the card's
  query rather than the saved version of the query."
  [card-id]
  {card-id su/IntGreaterThanZero}
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
      (api.field/field-id->values field-id query))))

(mu/defn param-values
  "Fetch values for a parameter.

  The source of values could be:
  - static-list: user defined values list
  - card: values is result of running a card"
  ([card param-key]
   (param-values card param-key nil))

  ([card      :- ms/Map
    param-key :- ms/NonBlankString
    query     :- [:maybe ms/NonBlankString]]
   (let [param       (get (m/index-by :id (or (seq (:parameters card))
                                              ;; some older cards or cards in e2e just use the template tags on native
                                              ;; queries
                                              (card/template-tag-parameters card)))
                          param-key)
         _source-type (:values_source_type param)]
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

(defn upload-csv!
  "Main entry point for CSV uploading. Coordinates detecting the schema, inserting it into an appropriate database,
  syncing and scanning the new data, and creating an appropriate model which is then returned. May throw validation or
  DB errors."
  [collection-id filename csv-file]
  (when (not (public-settings/uploads-enabled))
    (throw (Exception. "Uploads are not enabled.")))
  (collection/check-write-perms-for-collection collection-id)
  (let [db-id             (public-settings/uploads-database-id)
        database          (or (t2/select-one Database :id db-id)
                              (throw (Exception. (tru "The uploads database does not exist."))))
        schema-name       (public-settings/uploads-schema-name)
        filename-prefix   (or (second (re-matches #"(.*)\.csv$" filename))
                              filename)
        driver            (driver.u/database->driver database)
        _                 (or (driver/database-supports? driver :uploads nil)
                              (throw (Exception. (tru "Uploads are not supported on {0} databases." (str/capitalize (name driver))))))
        table-name        (->> (str (public-settings/uploads-table-prefix) filename-prefix)
                               (upload/unique-table-name driver))
        schema+table-name (if (str/blank? schema-name)
                            table-name
                            (str schema-name "." table-name))
        _                 (upload/load-from-csv driver db-id schema+table-name csv-file)
        _                 (sync/sync-database! database)
        table-id          (t2/select-one-fn :id Table :db_id db-id :%lower.name table-name)]
    (create-card!
     {:collection_id          collection-id,
      :dataset                true
      :database_id            db-id
      :dataset_query          {:database db-id
                               :query    {:source-table table-id}
                               :type     :query}
      :display                :table
      :name                   filename-prefix
      :visualization_settings {}})))

(api/defendpoint ^:multipart POST "/from-csv"
  "Create a table and model populated with the values from the attached CSV. Returns the model ID if successful."
  [:as {raw-params :params}]
  ;; parse-long returns nil with "root", which is what we want anyway
  (let [model-id (:id (upload-csv! (parse-long (get raw-params "collection_id"))
                                   (get-in raw-params ["file" :filename])
                                   (get-in raw-params ["file" :tempfile])))]
    {:status 200
     :body   model-id}))

(api/define-routes)
