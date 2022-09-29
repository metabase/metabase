(ns metabase.api.card
  "/api/card endpoints."
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.data :as data]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [compojure.core :refer [DELETE GET POST PUT]]
            [medley.core :as m]
            [metabase.actions :as actions]
            [metabase.api.action :as api.action]
            [metabase.api.common :as api]
            [metabase.api.common.validation :as validation]
            [metabase.api.dataset :as api.dataset]
            [metabase.api.timeline :as api.timeline]
            [metabase.driver :as driver]
            [metabase.email.messages :as messages]
            [metabase.events :as events]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.models :refer [Card Collection Database PersistedInfo Pulse]]
            [metabase.models.collection :as collection]
            [metabase.models.interface :as mi]
            [metabase.models.moderation-review :as moderation-review]
            [metabase.models.persisted-info :as persisted-info]
            [metabase.models.pulse :as pulse]
            [metabase.models.query :as query]
            [metabase.models.query.permissions :as query-perms]
            [metabase.models.revision.last-edit :as last-edit]
            [metabase.models.timeline :as timeline]
            [metabase.query-processor.async :as qp.async]
            [metabase.query-processor.card :as qp.card]
            [metabase.query-processor.pivot :as qp.pivot]
            [metabase.query-processor.util :as qp.util]
            [metabase.related :as related]
            [metabase.sync.analyze.query-results :as qr]
            [metabase.task.persist-refresh :as task.persist-refresh]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]])
  (:import clojure.core.async.impl.channels.ManyToManyChannel
           java.util.UUID))

;;; ----------------------------------------------- Filtered Fetch Fns -----------------------------------------------

(defmulti ^:private cards-for-filter-option*
  {:arglists '([filter-option & args])}
  (fn [filter-option & _]
    (keyword filter-option)))

;; return all Cards. This is the default filter option.
(defmethod cards-for-filter-option* :all
  [_]
  (db/select Card, :archived false, {:order-by [[:%lower.name :asc]]}))

;; Return all Cards belonging to Database with `database-id`.
(defmethod cards-for-filter-option* :database
  [_ database-id]
  (db/select Card, :database_id database-id, :archived false, {:order-by [[:%lower.name :asc]]}))

(defn- cards-for-filter-option [filter-option model-id-or-nil]
  (-> (apply cards-for-filter-option* (or filter-option :all) (when model-id-or-nil [model-id-or-nil]))
      (hydrate :creator :collection)))

;;; -------------------------------------------- Fetching a Card or Cards --------------------------------------------

(def ^:private CardFilterOption
  "Schema for a valid card filter option."
  (apply s/enum (map name (keys (methods cards-for-filter-option*)))))

(api/defendpoint GET "/"
  "Get all the Cards. Optional filter parameter `f` can be used to change the set of Cards that are returned;
  The default filter parameter is `all` which returns all Cards. Using `database` returns all cards
  in a database of the given `model_id` parameter."
  [f model_id]
  {f        (s/maybe CardFilterOption)
   model_id (s/maybe su/IntGreaterThanZero)}
  (let [f (keyword f)]
    (when (= f :database)
      (api/checkp (integer? model_id) "model_id" (format "model_id is a required parameter when filter mode is '%s'"
                                                         (name f)))
      (api/read-check Database model_id))
    (let [cards (filter mi/can-read? (cards-for-filter-option f model_id))
          last-edit-info (:card (last-edit/fetch-last-edited-info {:card-ids (map :id cards)}))]
      (into []
            (map (fn [{:keys [id] :as card}]
                   (if-let [edit-info (get last-edit-info id)]
                     (assoc card :last-edit-info edit-info)
                     card)))
            cards))))

(api/defendpoint GET "/:id"
  "Get `Card` with ID."
  [id ignore_view]
  (let [raw-card (db/select-one Card :id id)
        card (-> raw-card
                 (hydrate :creator
                          :bookmarked
                          :dashboard_count
                          :can_write
                          :average_query_time
                          :last_query_start
                          :collection [:moderation_reviews :moderator_details])
                 (cond-> ;; card
                   api/*is-superuser?* (hydrate [:emitters [:action :card]])
                   (:dataset raw-card) (hydrate :persisted)
                   (:is_write raw-card) (hydrate :card/emitter-usages :card/action-id))
                 api/read-check
                 (last-edit/with-last-edit-info :card))]
    (u/prog1 card
      (when-not (Boolean/parseBoolean ignore_view)
        (events/publish-event! :card-read (assoc <> :actor_id api/*current-user-id*))))))

(api/defendpoint GET "/:id/timelines"
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
      (a/to-chan! [metadata])

      ;; frontend always sends query. But sometimes programatic don't (cypress, API usage). Returning an empty channel
      ;; means the metadata won't be updated at all.
      (nil? query)
      (doto (a/chan) a/close!)

      ;; datasets need to incorporate the metadata either passed in or already in the db. Query has changed so we
      ;; re-run and blend the saved into the new metadata
      (and dataset? (or valid-metadata? (seq original-metadata)))
      (a/go (let [metadata' (if valid-metadata?
                              (map mbql.normalize/normalize-source-metadata metadata)
                              original-metadata)
                  fresh     (a/<! (qp.async/result-metadata-for-query-async query))]
              (qp.util/combine-metadata fresh metadata')))
      :else
      ;; compute fresh
      (qp.async/result-metadata-for-query-async query))))

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

(defn- check-allowed-to-set-is-write
  "Check whether we're allowed to set `is_write` for the Card in question."
  ([card]
   (check-allowed-to-set-is-write nil card))

  ([card-before-update card-updates]
   ;; make sure the value has actually changed
   (when (and (contains? card-updates :is_write)
              (some? (:is_write card-updates)))
     (let [before (boolean (get card-before-update :is_write))
           after  (:is_write card-updates)]
       (log/tracef "is_write value will change from %s => %s" (pr-str before) (pr-str after))
       (when-not (= before after)
         (try
           ;; make sure Card is not a Dataset
           (when (:dataset (merge card-updates card-before-update))
             (throw (ex-info (tru "Saved Question is a Dataset.")
                             {:status-code 400})))
           ;; make sure Card's query is a native query
           (let [query-type (some-> (get-in (merge card-updates card-before-update) [:dataset_query :type])
                                    keyword)]
             (when-not (= query-type :native)
               (throw (ex-info (tru "Query must be a native query.")
                               {:status-code 400}))))
           ;; make sure Actions are enabled Globally
           (when-not (actions/experimental-enable-actions)
             (throw (ex-info (tru "Actions are not enabled.")
                             {:status-code 400})))
           (when-let [database-id (:database (some :dataset_query [card-updates card-before-update]))]
             ;; make sure Actions are allowed for the Card's query's Database
             (api.action/check-actions-enabled database-id))
           (catch Throwable e
             (let [message (tru "Cannot mark Saved Question as ''is_write'': {0}" (ex-message e))]
               (throw (ex-info message
                               (assoc (ex-data e) :errors {:is_write message})
                               e))))))))))

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
              (let [current-query (db/select-one-field :dataset_query Card :id id)]
                (if (= (:dataset_query card) current-query)
                  (do (db/update! Card id {:result_metadata metadata})
                      (log/info (trs "Metadata updated asynchronously for card {0}" id)))
                  (log/info (trs "Not updating metadata asynchronously for card {0} because query has changed"
                                 id)))))))))

(defn create-card!
  "Create a new Card. Metadata will be fetched off thread. If the metadata takes longer than [[metadata-sync-wait-ms]]
  the card will be saved without metadata and it will be saved to the card in the future when it is ready."
  [{:keys [dataset_query result_metadata dataset parameters parameter_mappings], :as card-data}]
  ;; `zipmap` instead of `select-keys` because we want to get `nil` values for keys that aren't present. Required by
  ;; `api/maybe-reconcile-collection-position!`
  (let [data-keys            [:dataset_query :description :display :name :visualization_settings
                              :parameters :parameter_mappings :collection_id :collection_position :cache_ttl :is_write]
        card-data            (assoc (zipmap data-keys (map card-data data-keys))
                                    :creator_id api/*current-user-id*
                                    :is_write (boolean (:is_write card-data))
                                    :dataset (boolean (:dataset card-data))
                                    :parameters (or parameters [])
                                    :parameter_mappings (or parameter_mappings []))
        result-metadata-chan (result-metadata-async {:query    dataset_query
                                                     :metadata result_metadata
                                                     :dataset? dataset})
        metadata-timeout     (a/timeout metadata-sync-wait-ms)
        [metadata port]      (a/alts!! [result-metadata-chan metadata-timeout])
        timed-out?           (= port metadata-timeout)
        card                 (db/transaction
                              ;; Adding a new card at `collection_position` could cause other cards in this
                              ;; collection to change position, check that and fix it if needed
                              (api/maybe-reconcile-collection-position! card-data)
                              (db/insert! Card (cond-> card-data
                                                 (not timed-out?)
                                                 (assoc :result_metadata metadata))))]
    (events/publish-event! :card-create card)
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
                 (cond-> ;; card
                   (:is_write card) (hydrate :card/action-id))
                 (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))
      (when timed-out?
        (schedule-metadata-saving result-metadata-chan <>)))))

(api/defendpoint POST "/"
  "Create a new `Card`."
  [:as {{:keys [collection_id collection_position dataset_query description display name
                parameters parameter_mappings result_metadata visualization_settings cache_ttl is_write], :as body} :body}]
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
   cache_ttl              (s/maybe su/IntGreaterThanZero)
   is_write               (s/maybe s/Bool)}
  ;; check that we have permissions to run the query that we're trying to save
  (check-data-permissions-for-query dataset_query)
  ;; check that we have permissions for the collection we're trying to save this card to, if applicable
  (collection/check-write-perms-for-collection collection_id)
  ;; if `is_write` was passed, check that it's allowed to be set.
  (check-allowed-to-set-is-write body)
  (create-card! body))

(api/defendpoint POST "/:id/copy"
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
    ;; you can't embed an is_write (QueryAction) Card because they can't be ran by the normal QP pathway for results
    (when (:is_write card-before-updates)
      (throw (ex-info (tru "You cannot enable embedding for an is_write Card.")
                      {:status-code 400})))
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
  (db/delete! Pulse :id [:in (map :id alerts)])
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
  (db/transaction
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
   (db/update! Card id
     ;; `collection_id` and `description` can be `nil` (in order to unset them). Other values should only be
     ;; modified if they're passed in as non-nil
     (u/select-keys-when card-updates
       :present #{:collection_id :collection_position :description :cache_ttl :dataset :is_write}
       :non-nil #{:dataset_query :display :name :visualization_settings :archived :enable_embedding
                  :parameters :parameter_mappings :embedding_params :result_metadata :is_write :collection_preview})))
    ;; Fetch the updated Card from the DB

  (let [card (db/select-one Card :id id)]
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
          (:dataset card) (hydrate :persisted)
          (:is_write card) (hydrate :card/emitter-usages :card/action-id))
        (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))))

(api/defendpoint PUT "/:id"
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
               check-allowed-to-change-embedding
               check-allowed-to-set-is-write]]
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
(api/defendpoint DELETE "/:id"
  "Delete a Card. (DEPRECATED -- don't delete a Card anymore -- archive it instead.)"
  [id]
  (log/warn (tru "DELETE /api/card/:id is deprecated. Instead, change its `archived` value via PUT /api/card/:id."))
  (let [card (api/write-check Card id)]
    (db/delete! Card :id id)
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
        max-position-result (db/select-one [Card [:%max.collection_position :max_position]]
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
            (db/update! Card (u/the-id card)
              :collection_position idx
              :collection_id       new-collection-id-or-nil))
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
    (let [cards (db/select [Card :id :collection_id :collection_position :dataset_query]
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
      (db/transaction
        ;; If any of the cards have a `:collection_position`, we'll need to fixup the old collection now that the cards
        ;; are gone and update the position in the new collection
        (when-let [cards-with-position (seq (filter :collection_position cards))]
          (update-collection-positions! new-collection-id-or-nil cards-with-position))

        ;; ok, everything checks out. Set the new `collection_id` for all the Cards that haven't been updated already
        (when-let [cards-without-position (seq (for [card cards
                                                     :when (not (:collection_position card))]
                                                 (u/the-id card)))]
          (db/update-where! Card {:id [:in (set cards-without-position)]}
            :collection_id new-collection-id-or-nil))))))

(api/defendpoint POST "/collections"
  "Bulk update endpoint for Card Collections. Move a set of `Cards` with CARD_IDS into a `Collection` with
  COLLECTION_ID, or remove them from any Collections by passing a `null` COLLECTION_ID."
  [:as {{:keys [card_ids collection_id]} :body}]
  {card_ids [su/IntGreaterThanZero], collection_id (s/maybe su/IntGreaterThanZero)}
  (move-cards-to-collection! collection_id card_ids)
  {:status :ok})


;;; ------------------------------------------------ Running a Query -------------------------------------------------


(api/defendpoint ^:streaming POST "/:card-id/query"
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

(api/defendpoint ^:streaming POST "/:card-id/query/:export-format"
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

(api/defendpoint POST "/:card-id/public_link"
  "Generate publicly-accessible links for this Card. Returns UUID to be used in public links. (If this Card has
  already been shared, it will return the existing public link rather than creating a new one.)  Public sharing must
  be enabled."
  [card-id]
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check Card card-id))
  (let [{existing-public-uuid :public_uuid, is-write? :is_write} (db/select-one [Card :public_uuid :is_write] :id card-id)]
    ;; don't allow sharing `is_write` (QueryAction) Cards, since they can't be executed for results under the public QP
    ;; pathway
    (when is-write?
      (throw (ex-info (tru "You cannot share an is_write Card.")
                      {:status-code 400})))
    {:uuid (or existing-public-uuid
               (u/prog1 (str (UUID/randomUUID))
                 (db/update! Card card-id
                   :public_uuid       <>
                   :made_public_by_id api/*current-user-id*)))}))

(api/defendpoint DELETE "/:card-id/public_link"
  "Delete the publicly-accessible link to this Card."
  [card-id]
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-exists? Card :id card-id, :public_uuid [:not= nil])
  (db/update! Card card-id
    :public_uuid       nil
    :made_public_by_id nil)
  {:status 204, :body nil})

(api/defendpoint GET "/public"
  "Fetch a list of Cards with public UUIDs. These cards are publicly-accessible *if* public sharing is enabled."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (db/select [Card :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(api/defendpoint GET "/embeddable"
  "Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-embedding-enabled)
  (db/select [Card :name :id], :enable_embedding true, :archived false))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  (-> (db/select-one Card :id id) api/read-check related/related))

(api/defendpoint POST "/related"
  "Return related entities for an ad-hoc query."
  [:as {query :body}]
  (related/related (query/adhoc-query query)))

(api/defendpoint ^:streaming POST "/pivot/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache]
                 :or   {ignore_cache false}} :body}]
  {ignore_cache (s/maybe s/Bool)}
  (qp.card/run-query-for-card-async card-id :api
                            :parameters parameters,
                            :qp-runner qp.pivot/run-pivot-query
                            :ignore_cache ignore_cache))

(api/defendpoint POST "/:card-id/persist"
  "Mark the model (card) as persisted. Runs the query and saves it to the database backing the card and hot swaps this
  query in place of the model's query."
  [card-id]
  {card-id su/IntGreaterThanZero}
  (api/let-404 [{:keys [dataset database_id] :as card} (db/select-one Card :id card-id)]
    (let [database (db/select-one Database :id database_id)]
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
  {card-id su/IntGreaterThanZero}
  (api/let-404 [card           (db/select-one Card :id card-id)
                persisted-info (db/select-one PersistedInfo :card_id card-id)]
    (when (not (:dataset card))
      (throw (ex-info (trs "Cannot refresh a non-model question") {:status-code 400})))
    (when (:archived card)
      (throw (ex-info (trs "Cannot refresh an archived model") {:status-code 400})))
    (api/write-check (db/select-one Database :id (:database_id persisted-info)))
    (task.persist-refresh/schedule-refresh-for-individual! persisted-info)
    api/generic-204-no-content))

(api/defendpoint POST "/:card-id/unpersist"
  "Unpersist this model. Deletes the persisted table backing the model and all queries after this will use the card's
  query rather than the saved version of the query."
  [card-id]
  {card-id su/IntGreaterThanZero}
  (api/let-404 [_card (db/select-one Card :id card-id)]
    (api/let-404 [persisted-info (db/select-one PersistedInfo :card_id card-id)]
      (api/write-check (db/select-one Database :id (:database_id persisted-info)))
      (persisted-info/mark-for-pruning! {:id (:id persisted-info)} "off")
      api/generic-204-no-content)))

(api/define-routes)
