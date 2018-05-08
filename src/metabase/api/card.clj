(ns metabase.api.card
  "/api/card endpoints."
  (:require [cheshire.core :as json]
            [clojure.data :as data]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [medley.core :as m]
            [metabase
             [events :as events]
             [middleware :as middleware]
             [public-settings :as public-settings]
             [query-processor :as qp]
             [util :as u]]
            [metabase.api
             [common :as api]
             [dataset :as dataset-api]
             [label :as label-api]]
            [metabase.api.common.internal :refer [route-fn-name]]
            [metabase.email.messages :as messages]
            [metabase.models
             [card :as card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [card-label :refer [CardLabel]]
             [collection :refer [Collection]]
             [database :refer [Database]]
             [interface :as mi]
             [label :refer [Label]]
             [permissions :as perms]
             [pulse :as pulse :refer [Pulse]]
             [query :as query]
             [table :refer [Table]]
             [view-log :refer [ViewLog]]]
            [metabase.query-processor
             [interface :as qpi]
             [util :as qputil]]
            [metabase.query-processor.middleware
             [cache :as cache]
             [results-metadata :as results-metadata]]
            [metabase.related :as related]
            [metabase.util.schema :as su]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]])
  (:import java.util.UUID))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn- ^:deprecated hydrate-labels
  "Efficiently hydrate the `Labels` for a large collection of `Cards`."
  [cards]
  (let [card-labels          (db/select [CardLabel :card_id :label_id])
        label-id->label      (when (seq card-labels)
                               (u/key-by :id (db/select Label :id [:in (map :label_id card-labels)])))
        card-id->card-labels (group-by :card_id card-labels)]
    (for [card cards]
      (assoc card :labels (for [card-label (card-id->card-labels (:id card))] ; TODO - do these need to be sorted ?
                            (label-id->label (:label_id card-label)))))))

(defn- hydrate-favorites
  "Efficiently add `favorite` status for a large collection of `Cards`."
  [cards]
  (when (seq cards)
    (let [favorite-card-ids (db/select-field :card_id CardFavorite
                              :owner_id api/*current-user-id*
                              :card_id  [:in (map :id cards)])]
      (for [card cards]
        (assoc card :favorite (contains? favorite-card-ids (:id card)))))))


;;; ----------------------------------------------- Filtered Fetch Fns -----------------------------------------------

(defn- cards:all
  "Return all `Cards`."
  []
  (db/select Card, :archived false, {:order-by [[:%lower.name :asc]]}))

(defn- cards:mine
  "Return all `Cards` created by current user."
  []
  (db/select Card, :creator_id api/*current-user-id*, :archived false, {:order-by [[:%lower.name :asc]]}))

(defn- cards:fav
  "Return all `Cards` favorited by the current user."
  []
  (->> (hydrate (db/select [CardFavorite :card_id], :owner_id api/*current-user-id*)
                :card)
       (map :card)
       (filter (complement :archived))
       (sort-by :name)))

(defn- cards:database
  "Return all `Cards` belonging to `Database` with DATABASE-ID."
  [database-id]
  (db/select Card, :database_id database-id, :archived false, {:order-by [[:%lower.name :asc]]}))

(defn- cards:table
  "Return all `Cards` belonging to `Table` with TABLE-ID."
  [table-id]
  (db/select Card, :table_id table-id, :archived false, {:order-by [[:%lower.name :asc]]}))

(defn- cards-with-ids
  "Return unarchived `Cards` with CARD-IDS.
   Make sure cards are returned in the same order as CARD-IDS`; `[in card-ids]` won't preserve the order."
  [card-ids]
  {:pre [(every? integer? card-ids)]}
  (let [card-id->card (u/key-by :id (db/select Card, :id [:in (set card-ids)], :archived false))]
    (filter identity (map card-id->card card-ids))))

(defn- cards:recent
  "Return the 10 `Cards` most recently viewed by the current user, sorted by how recently they were viewed."
  []
  (cards-with-ids (map :model_id (db/select [ViewLog :model_id [:%max.timestamp :max]]
                                   :model   "card"
                                   :user_id api/*current-user-id*
                                   {:group-by [:model_id]
                                    :order-by [[:max :desc]]
                                    :limit    10}))))

(defn- cards:popular
  "All `Cards`, sorted by popularity (the total number of times they are viewed in `ViewLogs`).
  (yes, this isn't actually filtering anything, but for the sake of simplicitiy it is included amongst the filter
  options for the time being)."
  []
  (cards-with-ids (map :model_id (db/select [ViewLog :model_id [:%count.* :count]]
                                   :model "card"
                                   {:group-by [:model_id]
                                    :order-by [[:count :desc]]}))))

(defn- cards:archived
  "`Cards` that have been archived."
  []
  (db/select Card, :archived true, {:order-by [[:%lower.name :asc]]}))

(def ^:private filter-option->fn
  "Functions that should be used to return cards for a given filter option. These functions are all be called with
  `model-id` as the sole paramenter; functions that don't use the param discard it via `u/drop-first-arg`.

     ((filter->option->fn :recent) model-id) -> (cards:recent)"
  {:all      (u/drop-first-arg cards:all)
   :mine     (u/drop-first-arg cards:mine)
   :fav      (u/drop-first-arg cards:fav)
   :database cards:database
   :table    cards:table
   :recent   (u/drop-first-arg cards:recent)
   :popular  (u/drop-first-arg cards:popular)
   :archived (u/drop-first-arg cards:archived)})

(defn- ^:deprecated card-has-label? [label-slug card]
  (contains? (set (map :slug (:labels card))) label-slug))

(defn- collection-slug->id [collection-slug]
  (when (seq collection-slug)
    ;; special characters in the slugs are always URL-encoded when stored in the DB, e.g.  "Obsługa klienta" becomes
    ;; "obs%C5%82uga_klienta". But for some weird reason sometimes the slug is passed in like "obsługa_klientaa" (not
    ;; URL-encoded) so go ahead and URL-encode the input as well so we can match either case
    (api/check-404 (db/select-one-id Collection
                     {:where [:or [:= :slug collection-slug]
                              [:= :slug (codec/url-encode collection-slug)]]}))))

;; TODO - do we need to hydrate the cards' collections as well?
(defn- cards-for-filter-option [filter-option model-id label collection-slug]
  (let [cards (-> ((filter-option->fn (or filter-option :all)) model-id)
                  (hydrate :creator :collection :in_public_dashboard)
                  hydrate-labels
                  hydrate-favorites)]
    ;; Since labels and collections are hydrated in Clojure-land we need to wait until this point to apply
    ;; label/collection filtering. If applicable COLLECTION can optionally be an empty string which is used to
    ;; represent *no collection*
    (filter (cond
              collection-slug (let [collection-id (collection-slug->id collection-slug)]
                                (comp (partial = collection-id) :collection_id))
              (seq label)     (partial card-has-label? label)
              :else           identity)
            cards)))


;;; -------------------------------------------- Fetching a Card or Cards --------------------------------------------

(def ^:private CardFilterOption
  "Schema for a valid card filter option."
  (apply s/enum (map name (keys filter-option->fn))))

(api/defendpoint GET "/"
  "Get all the `Cards`. Option filter param `f` can be used to change the set of Cards that are returned; default is
  `all`, but other options include `mine`, `fav`, `database`, `table`, `recent`, `popular`, and `archived`. See
  corresponding implementation functions above for the specific behavior of each filter option. :card_index:

  Optionally filter cards by LABEL or COLLECTION slug. (COLLECTION can be a blank string, to signify cards with *no
  collection* should be returned.)

  NOTES:

  *  Filtering by LABEL is considered *deprecated*, as `Labels` will be removed from an upcoming version of Metabase
     in favor of `Collections`.
  *  LABEL and COLLECTION params are mutually exclusive; if both are specified, LABEL will be ignored and Cards will
     only be filtered by their `Collection`.
  *  If no `Collection` exists with the slug COLLECTION, this endpoint will return a 404."
  [f model_id label collection]
  {f          (s/maybe CardFilterOption)
   model_id   (s/maybe su/IntGreaterThanZero)
   label      (s/maybe su/NonBlankString)
   collection (s/maybe s/Str)}
  (let [f (keyword f)]
    (when (contains? #{:database :table} f)
      (api/checkp (integer? model_id) "model_id" (format "model_id is a required parameter when filter mode is '%s'"
                                                         (name f)))
      (case f
        :database (api/read-check Database model_id)
        :table    (api/read-check Database (db/select-one-field :db_id Table, :id model_id))))
    (->> (cards-for-filter-option f model_id label collection)
         ;; filterv because we want make sure all the filtering is done while current user perms set is still bound
         (filterv mi/can-read?))))


(api/defendpoint GET "/:id"
  "Get `Card` with ID."
  [id]
  (u/prog1 (-> (Card id)
               (hydrate :creator :dashboard_count :labels :can_write :collection :in_public_dashboard)
               api/read-check)
    (events/publish-event! :card-read (assoc <> :actor_id api/*current-user-id*))))


;;; -------------------------------------------------- Saving Cards --------------------------------------------------

;; When a new Card is saved, we wouldn't normally have the results metadata for it until the first time its query is
;; ran.  As a workaround, we'll calculate this metadata and return it with all query responses, and then let the
;; frontend pass it back to us when saving or updating a Card.  As a basic step to make sure the Metadata is valid
;; we'll also pass a simple checksum and have the frontend pass it back to us.  See the QP `results-metadata`
;; middleware namespace for more details

(s/defn ^:private result-metadata-for-query :- results-metadata/ResultsMetadata
  "Fetch the results metadata for a QUERY by running the query and seeing what the QP gives us in return.
   This is obviously a bit wasteful so hopefully we can avoid having to do this."
  [query]
  (binding [qpi/*disable-qp-logging* true]
    (get-in (qp/process-query query) [:data :results_metadata :columns])))

(s/defn ^:private result-metadata :- (s/maybe results-metadata/ResultsMetadata)
  "Get the right results metadata for this CARD. We'll check to see whether the METADATA passed in seems valid;
   otherwise we'll run the query ourselves to get the right values."
  [query metadata checksum]
  (let [valid-metadata? (and (results-metadata/valid-checksum? metadata checksum)
                             (s/validate results-metadata/ResultsMetadata metadata))]
    (log/info (str "Card results metadata passed in to API is "
                   (cond
                     valid-metadata? "VALID. Thanks!"
                     metadata        "INVALID. Running query to fetch correct metadata."
                     :else           "MISSING. Running query to fetch correct metadata.")))
    (if valid-metadata?
      metadata
      (result-metadata-for-query query))))

(api/defendpoint POST "/"
  "Create a new `Card`."
  [:as {{:keys [dataset_query description display name visualization_settings collection_id result_metadata
                metadata_checksum]} :body}]
  {name                   su/NonBlankString
   description            (s/maybe su/NonBlankString)
   display                su/NonBlankString
   visualization_settings su/Map
   collection_id          (s/maybe su/IntGreaterThanZero)
   result_metadata        (s/maybe results-metadata/ResultsMetadata)
   metadata_checksum      (s/maybe su/NonBlankString)}
  ;; check that we have permissions to run the query that we're trying to save
  (api/check-403 (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set*
                   (card/query-perms-set dataset_query :write)))
  ;; check that we have permissions for the collection we're trying to save this card to, if applicable
  (when collection_id
    (api/check-403 (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                     (perms/collection-readwrite-path collection_id))))
  ;; everything is g2g, now save the card
  (let [card (db/insert! Card
               :creator_id             api/*current-user-id*
               :dataset_query          dataset_query
               :description            description
               :display                display
               :name                   name
               :visualization_settings visualization_settings
               :collection_id          collection_id
               :result_metadata        (result-metadata dataset_query result_metadata metadata_checksum))]
    (events/publish-event! :card-create card)
    ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently has
    ;; with returned one -- See #4283
    (hydrate card :creator :dashboard_count :labels :can_write :collection)))


;;; ------------------------------------------------- Updating Cards -------------------------------------------------

(defn- check-permissions-for-collection
  "Check that we have permissions to add or remove cards from `Collection` with COLLECTION-ID."
  [collection-id]
  (api/check-403 (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                                  (perms/collection-readwrite-path collection-id))))

(defn- check-allowed-to-change-collection
  "If we're changing the `collection_id` of the Card, make sure we have write permissions for the new group."
  [card collection-id]
  (when (and collection-id
             (not= collection-id (:collection_id card)))
    (check-permissions-for-collection collection-id)))

(defn check-data-permissions-for-query
  "Check that we have *data* permissions to run the QUERY in question."
  [query]
  {:pre [(map? query)]}
  (api/check-403 (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set*
                                                          (card/query-perms-set query :read))))

(defn- check-allowed-to-modify-query
  "If the query is being modified, check that we have data permissions to run the query."
  [card query]
  (when (and query
             (not= query (:dataset_query card)))
    (check-data-permissions-for-query query)))

(defn- check-allowed-to-unarchive
  "When unarchiving a Card, make sure we have data permissions for the Card query before doing so."
  [card archived?]
  (when (and (false? archived?)
             (:archived card))
    (check-data-permissions-for-query (:dataset_query card))))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding` or `embedding_params`. Embedding must be
  enabled."
  [card enable-embedding? embedding-params]
  (when (or (and (some? enable-embedding?)
                 (not= enable-embedding? (:enable_embedding card)))
            (and embedding-params
                 (not= embedding-params (:embedding_params card))))
    (api/check-embedding-enabled)
    (api/check-superuser)))


(defn- result-metadata-for-updating
  "If CARD's query is being updated, return the value that should be saved for `result_metadata`. This *should* be
  passed in to the API; if so, verifiy that it was correct (the checksum is valid); if not, go fetch it.  If the query
  has not changed, this returns `nil`, which means the value won't get updated below."
  [card query metadata checksum]
  (when (and query
             (not= query (:dataset_query card)))

    (result-metadata query metadata checksum)))

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
  (and (or (line-area-bar? display)
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
  (when-let [alerts (seq (pulse/retrieve-alerts-for-card card-id))]
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

(api/defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [dataset_query description display name visualization_settings archived collection_id
                   enable_embedding embedding_params result_metadata metadata_checksum], :as body} :body}]
  {name                   (s/maybe su/NonBlankString)
   dataset_query          (s/maybe su/Map)
   display                (s/maybe su/NonBlankString)
   description            (s/maybe s/Str)
   visualization_settings (s/maybe su/Map)
   archived               (s/maybe s/Bool)
   enable_embedding       (s/maybe s/Bool)
   embedding_params       (s/maybe su/EmbeddingParams)
   collection_id          (s/maybe su/IntGreaterThanZero)
   result_metadata        (s/maybe results-metadata/ResultsMetadata)
   metadata_checksum      (s/maybe su/NonBlankString)}
  (let [card-before-update (api/write-check Card id)]
    ;; Do various permissions checks
    (check-allowed-to-change-collection card-before-update collection_id)
    (check-allowed-to-modify-query card-before-update dataset_query)
    (check-allowed-to-unarchive card-before-update archived)
    (check-allowed-to-change-embedding card-before-update enable_embedding embedding_params)
    ;; make sure we have the correct `result_metadata`
    (let [body (assoc body :result_metadata (result-metadata-for-updating card-before-update dataset_query
                                                                          result_metadata metadata_checksum))]
      ;; ok, now save the Card
      (db/update! Card id
        ;; `collection_id` and `description` can be `nil` (in order to unset them). Other values should only be
        ;; modified if they're passed in as non-nil
        (u/select-keys-when body
          :present #{:collection_id :description}
          :non-nil #{:dataset_query :display :name :visualization_settings :archived :enable_embedding
                     :embedding_params :result_metadata})))
    ;; Fetch the updated Card from the DB
    (let [card (Card id)]

      (delete-alerts-if-needed! card-before-update card)

      (publish-card-update! card archived)
      ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently has with
      ;; returned one -- See #4142
      (hydrate card :creator :dashboard_count :labels :can_write :collection))))


;;; ------------------------------------------------- Deleting Cards -------------------------------------------------

;; TODO - Pretty sure this endpoint is not actually used any more, since Cards are supposed to get archived (via PUT
;;        /api/card/:id) instead of deleted.  Should we remove this?
(api/defendpoint DELETE "/:id"
  "Delete a `Card`."
  [id]
  (log/warn (str "DELETE /api/card/:id is deprecated. Instead of deleting a Card, "
                 "you should change its `archived` value via PUT /api/card/:id."))
  (let [card (api/write-check Card id)]
    (db/delete! Card :id id)
    (events/publish-event! :card-delete (assoc card :actor_id api/*current-user-id*)))
  api/generic-204-no-content)


;;; --------------------------------------------------- Favoriting ---------------------------------------------------

(api/defendpoint POST "/:card-id/favorite"
  "Favorite a Card."
  [card-id]
  (api/read-check Card card-id)
  (db/insert! CardFavorite :card_id card-id, :owner_id api/*current-user-id*))


(api/defendpoint DELETE "/:card-id/favorite"
  "Unfavorite a Card."
  [card-id]
  (api/read-check Card card-id)
  (api/let-404 [id (db/select-one-id CardFavorite :card_id card-id, :owner_id api/*current-user-id*)]
    (db/delete! CardFavorite, :id id))
  api/generic-204-no-content)


;;; ---------------------------------------------- Editing Card Labels -----------------------------------------------


(api/defendpoint POST "/:card-id/labels"
  "Update the set of `Labels` that apply to a `Card`.
   (This endpoint is considered DEPRECATED as Labels will be removed in a future version of Metabase.)"
  [card-id :as {{:keys [label_ids]} :body}]
  {label_ids [su/IntGreaterThanZero]}
  (label-api/warn-about-labels-being-deprecated)
  (api/write-check Card card-id)
  (let [[labels-to-remove labels-to-add] (data/diff (set (db/select-field :label_id CardLabel :card_id card-id))
                                                    (set label_ids))]
    (when (seq labels-to-remove)
      (db/delete! CardLabel, :label_id [:in labels-to-remove], :card_id card-id))
    (doseq [label-id labels-to-add]
      (db/insert! CardLabel :label_id label-id, :card_id card-id)))
  {:status :ok})


;;; -------------------------------------------- Bulk Collections Update ---------------------------------------------

(defn- move-cards-to-collection! [new-collection-id-or-nil card-ids]
  ;; if moving to a collection, make sure we have write perms for it
  (when new-collection-id-or-nil
    (api/write-check Collection new-collection-id-or-nil))
  ;; for each affected card...
  (when (seq card-ids)
    (let [cards (db/select [Card :id :collection_id :dataset_query]
                  {:where [:and [:in :id (set card-ids)]
                                [:or [:not= :collection_id new-collection-id-or-nil]
                                     (when new-collection-id-or-nil
                                       [:= :collection_id nil])]]})] ; poisioned NULLs = ick
      ;; ...check that we have write permissions for it...
      (doseq [card cards]
        (api/write-check card))
      ;; ...and check that we have write permissions for the old collections if applicable
      (doseq [old-collection-id (set (filter identity (map :collection_id cards)))]
        (api/write-check Collection old-collection-id)))
    ;; ok, everything checks out. Set the new `collection_id` for all the Cards
    (db/update-where! Card {:id [:in (set card-ids)]}
      :collection_id new-collection-id-or-nil)))

(api/defendpoint POST "/collections"
  "Bulk update endpoint for Card Collections. Move a set of `Cards` with CARD_IDS into a `Collection` with
  COLLECTION_ID, or remove them from any Collections by passing a `null` COLLECTION_ID."
  [:as {{:keys [card_ids collection_id]} :body}]
  {card_ids [su/IntGreaterThanZero], collection_id (s/maybe su/IntGreaterThanZero)}
  (move-cards-to-collection! collection_id card_ids)
  {:status :ok})


;;; ------------------------------------------------ Running a Query -------------------------------------------------

(defn- query-magic-ttl
  "Compute a 'magic' cache TTL time (in seconds) for QUERY by multipling its historic average execution times by the
  `query-caching-ttl-ratio`. If the TTL is less than a second, this returns `nil` (i.e., the cache should not be
  utilized.)"
  [query]
  (when-let [average-duration (query/average-execution-time-ms (qputil/query-hash query))]
    (let [ttl-seconds (Math/round (float (/ (* average-duration (public-settings/query-caching-ttl-ratio))
                                            1000.0)))]
      (when-not (zero? ttl-seconds)
        (log/info (format "Question's average execution duration is %d ms; using 'magic' TTL of %d seconds"
                          average-duration ttl-seconds)
                  (u/emoji "💾"))
        ttl-seconds))))

(defn- query-for-card [card parameters constraints]
  (let [query (assoc (:dataset_query card)
                :constraints constraints
                :parameters  parameters)
        ttl   (when (public-settings/enable-query-caching)
                (or (:cache_ttl card)
                    (query-magic-ttl query)))]
    (assoc query :cache_ttl ttl)))

(defn run-query-for-card
  "Run the query for Card with PARAMETERS and CONSTRAINTS, and return results in the usual format."
  {:style/indent 1}
  [card-id & {:keys [parameters constraints context dashboard-id]
              :or   {constraints qp/default-query-constraints
                     context     :question}}]
  {:pre [(u/maybe? sequential? parameters)]}
  (let [card    (api/read-check (hydrate (Card card-id) :in_public_dashboard))
        query   (query-for-card card parameters constraints)
        options {:executed-by  api/*current-user-id*
                 :context      context
                 :card-id      card-id
                 :dashboard-id dashboard-id}]
    (api/check-not-archived card)
    (qp/process-query-and-save-execution! query options)))

(api/defendpoint POST "/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache], :or {ignore_cache false}} :body}]
  {ignore_cache (s/maybe s/Bool)}
  (binding [cache/*ignore-cached-results* ignore_cache]
    (run-query-for-card card-id, :parameters parameters)))

(api/defendpoint POST "/:card-id/query/:export-format"
  "Run the query associated with a Card, and return its results as a file in the specified format. Note that this
  expects the parameters as serialized JSON in the 'parameters' parameter"
  [card-id export-format parameters]
  {parameters    (s/maybe su/JSONString)
   export-format dataset-api/ExportFormat}
  (binding [cache/*ignore-cached-results* true]
    (dataset-api/as-format export-format
      (run-query-for-card card-id
        :parameters  (json/parse-string parameters keyword)
        :constraints nil
        :context     (dataset-api/export-format->context export-format)))))


;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api/defendpoint POST "/:card-id/public_link"
  "Generate publicly-accessible links for this Card. Returns UUID to be used in public links. (If this Card has
  already been shared, it will return the existing public link rather than creating a new one.)  Public sharing must
  be enabled."
  [card-id]
  (api/check-superuser)
  (api/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check Card card-id))
  {:uuid (or (db/select-one-field :public_uuid Card :id card-id)
             (u/prog1 (str (UUID/randomUUID))
               (db/update! Card card-id
                 :public_uuid       <>
                 :made_public_by_id api/*current-user-id*)))})

(api/defendpoint DELETE "/:card-id/public_link"
  "Delete the publicly-accessible link to this Card."
  [card-id]
  (api/check-superuser)
  (api/check-public-sharing-enabled)
  (api/check-exists? Card :id card-id, :public_uuid [:not= nil])
  (db/update! Card card-id
    :public_uuid       nil
    :made_public_by_id nil)
  {:status 204, :body nil})

(api/defendpoint GET "/public"
  "Fetch a list of Cards with public UUIDs. These cards are publicly-accessible *if* public sharing is enabled."
  []
  (api/check-superuser)
  (api/check-public-sharing-enabled)
  (db/select [Card :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(api/defendpoint GET "/embeddable"
  "Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT."
  []
  (api/check-superuser)
  (api/check-embedding-enabled)
  (db/select [Card :name :id], :enable_embedding true, :archived false))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  (-> id Card api/read-check related/related))

(api/defendpoint POST "/related"
  "Return related entities for an ad-hoc query."
  [:as {query :body}]
  (related/related (query/adhoc-query query)))

(api/define-routes)
