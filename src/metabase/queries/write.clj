(ns metabase.queries.write
  "The writes of a Card that the entry points make: create and update, with the dashcard placement, the parameter
  mapping follow-up and the cascade to dependent Cards."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.cache.core :as cache]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.events.core :as events]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.pulse.core :as pulse]
   [metabase.queries.db :as queries.db]
   [metabase.queries.models.card :as models.card]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- autoplace-dashcard-for-card! [dashboard-id maybe-dashboard-tab-id card size]
  (let [dashboard (t2/hydrate (queries.db/dashboard dashboard-id) :dashcards [:tabs :tab-cards])
        {:keys [dashcards tabs]} dashboard
        tabs (remove #(when maybe-dashboard-tab-id (not= maybe-dashboard-tab-id (:id %))) tabs)
        already-on-dashboard? (seq (filter #(= (:id card) (:card_id %)) dashcards))]
    (when-not already-on-dashboard?
      (let [first-tab (first tabs)
            cards-on-first-tab (or (when first-tab
                                     (:cards first-tab))
                                   dashcards)
            new-spot (if-let [{:keys [size_x size_y]} size]
                       (autoplace/get-position-for-new-dashcard
                        cards-on-first-tab size_x size_y autoplace/default-grid-width)
                       (autoplace/get-position-for-new-dashcard
                        cards-on-first-tab (:display card)))]
        (queries.db/insert-dashcard! (assoc new-spot
                                            :dashboard_tab_id (some-> first-tab :id)
                                            :card_id (:id card)
                                            :dashboard_id dashboard-id))))))

(defn- autoremove-dashcard-for-card!
  [card-id dashboard-id]
  (queries.db/delete-dashcards-for-card-on-dashboard! card-id dashboard-id)
  (when-let [dashcard-ids (seq (map :id (queries.db/dashcard-series-for-card-on-dashboard card-id dashboard-id)))]
    (queries.db/delete-dashcard-series! (set dashcard-ids))))

(defn- autoplace-or-remove-dashcards-for-card!
  "When moving around dashboard questions (cards that are internal to a dashboard), we need to remove or autoplace new
  DashboardQuestions."
  [{:as card-before-update
    card-id :id
    old-archived :archived
    old-dashboard-id :dashboard_id}
   {:as card-updates
    dashboard-id-update :dashboard_id
    dashboard-tab-id :dashboard_tab_id
    archived-update :archived}
   delete-old-dashcards?]
  (let [dashboard-changes? (api/column-will-change? old-dashboard-id (get card-updates :dashboard_id ::api/not-provided))
        new-dashboard-id (if-not dashboard-changes?
                           old-dashboard-id
                           dashboard-id-update)
        on-dashboard-before? (boolean old-dashboard-id)
        on-dashboard-after? (boolean new-dashboard-id)
        archived-changes? (api/column-will-change? old-archived (get card-updates :archived ::api/not-provided))
        new-archived (if-not archived-changes?
                       old-archived
                       archived-update)
        archived-after? (boolean new-archived)]
    ;; you can't specify the dashboard_tab_id if not on a dashboard
    (api/check-400
     (not (and dashboard-tab-id
               (not new-dashboard-id))))
    ;; we'll end up unarchived and a dashboard card => make sure we autoplace
    (when (and on-dashboard-after? (not archived-after?))
      (autoplace-dashcard-for-card! new-dashboard-id dashboard-tab-id card-before-update nil))
    (when (and
           ;; we start out as a DQ, and
           on-dashboard-before?
           (or
            ;; we're moving to a *different* dashboard,
            (and on-dashboard-after?
                 dashboard-changes?)
            ;; we're archiving the DQ, or
            (and archived-after?
                 on-dashboard-after?)
            ;; we're moving the DQ to a collection, AND the user has told us to delete
            (and (not on-dashboard-after?)
                 delete-old-dashcards?)))
      (autoremove-dashcard-for-card! card-id old-dashboard-id))
    ;; we're moving from a collection to a dashboard, and the user has told us to remove the dashcards for other
    ;; dashboards
    (when (and on-dashboard-after?
               (not on-dashboard-before?)
               delete-old-dashcards?)
      ;; TODO: should we publish events here? might be expensive, and it might not be right to show "card X was
      ;; removed from the dashboard" since you can't restore to the previous state...
      (queries.db/delete-dashcards-for-card-off-dashboard! card-id new-dashboard-id)
      (when-let [ids (seq (map :id (queries.db/dashcard-series-for-card-off-dashboard card-id new-dashboard-id)))]
        (queries.db/delete-dashcard-series! ids)))))

(defn create-card!
  "Create a new Card. Metadata will be fetched off thread. If the metadata takes longer than [[metadata-sync-wait-ms]]
  the card will be saved without metadata and it will be saved to the card in the future when it is ready.

  The Card events are published by the write of the row."
  ([card creator] (create-card! card creator true))
  ([{:keys [result_metadata parameters parameter_mappings type] :as input-card-data} creator autoplace-dashboard-questions?]
   ;; you can't specify the dashboard_tab_id and not a dashboard_id
   (api/check-400 (not (and (:dashboard_tab_id input-card-data)
                            (not (:dashboard_id input-card-data)))))
   ;; Gated here, not in `check-allowed-to-create-card!`: the copy endpoints skip that stack but still autoplace.
   (when-let [dashboard-id (and autoplace-dashboard-questions? (:dashboard_id input-card-data))]
     (models.card/check-shared-dashboard-timeline-permissions! (queries.db/dashboard dashboard-id) [input-card-data]))
   (let [data-keys                          [:dataset_query :description :display :name :visualization_settings
                                             :parameters :parameter_mappings :collection_id :collection_position
                                             :cache_ttl :type :dashboard_id :document_id]
         position-info                      {:collection_id (:collection_id input-card-data)
                                             :collection_position (:collection_position input-card-data)}
         card-data                          (-> (select-keys input-card-data data-keys)
                                                (assoc
                                                 :creator_id (:id creator)
                                                 :parameters (or parameters [])
                                                 :parameter_mappings (or parameter_mappings [])
                                                 :entity_id (u/generate-nano-id))
                                                (cond-> (nil? type)
                                                  (assoc :type :question))
                                                ;; Strict so a malformed query throws here instead of being silently
                                                ;; coerced to `{}`. See #74615.
                                                (m/update-existing :dataset_query #(lib-be/normalize-query nil % {:strict? true})))
         {:keys [metadata metadata-future]} (card.metadata/maybe-async-result-metadata
                                             {:query     (:dataset_query card-data)
                                              :metadata  result_metadata
                                              :entity-id (:entity_id card-data)
                                              :model?    (models.card/model? card-data)})
         card                               (t2/with-transaction [_conn]
                                              ;; Adding a new card at `collection_position` could cause other cards in
                                              ;; this collection to change position, check that and fix it if needed
                                              (api/maybe-reconcile-collection-position! position-info)
                                              (queries.db/insert-card!
                                               (lib/normalize ::queries.schema/card.update
                                                              (cond-> card-data
                                                                metadata
                                                                (assoc :result_metadata metadata)))))]
     (let [{:keys [dashboard_id]} card]
       (when (and dashboard_id autoplace-dashboard-questions?)
         (autoplace-dashcard-for-card! dashboard_id (:dashboard_tab_id input-card-data) card (:size input-card-data))))
     (when metadata-future
       (log/info "Metadata not available soon enough. Saving new card and asynchronously updating metadata")
       (card.metadata/save-metadata-async! metadata-future card))
     ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently has with
     ;; returned one -- See #4283
     card)))

(mu/defn- mbql-clause->identifier-for-parameter-updates
  "Get the unique key used to power the parameter mapping update stuff added in #49308. Key is an MBQL-5-style clause
  but with an empty options clause."
  [mbql-clause :- vector?]
  ;; this can currently get called with either MBQL 5 (from query breakouts) or with legacy refs (in `parameter_mappings`)
  (if (map? (second mbql-clause))
    (into [(first mbql-clause)] (drop 2) mbql-clause)
    (subvec mbql-clause 0 2)))

(defn- breakout->identifier->refs
  "Generate mapping of of _ref identifier_ -> #{_ref..._}.

  _ref identifier_ is a vector of first 2 elements of ref, eg. [:expression \"xix\"] or [:field 10]"
  [breakouts]
  (-> (group-by mbql-clause->identifier-for-parameter-updates breakouts)
      (update-vals set)))

(defn- action-for-identifier+refs
  "Generate _action_ for combination of args.

  _Action_ is to be performed on _parameter mapping_ of a _dashcard_. For more info see
  the [[update-associated-parameters!]]'s docstring.

  _Action_ has a form of [<action> & args]."
  [after-identifier->refs identifier before-refs]
  (let [after-refs (get after-identifier->refs identifier #{})]
    (when (and (= 1 (count before-refs) (count after-refs))
               (not= (lib/remove-lib-uuids before-refs) (lib/remove-lib-uuids after-refs)))
      [:update (first after-refs)])))

(defn- breakouts->identifier->action
  "Generate mapping of _identifier_ -> _action_.

  _identifier_ is is a vector of first 2 elements of ref, eg. [:expression \"xix\"] or [:field 10]. Action is generated
  in [[action-for-identifier+refs]] and performed later in [[update-mapping]]."
  [breakout-before-update breakout-after-update]
  (let [before-identifier->refs (breakout->identifier->refs breakout-before-update)
        after-identifier->refs  (breakout->identifier->refs breakout-after-update)]
    ;; Remove no-ops to avoid redundant db calls in [[update-associated-parameters!]].
    (->> before-identifier->refs
         (m/map-kv-vals #(action-for-identifier+refs after-identifier->refs %1 %2))
         (m/filter-vals some?)
         not-empty)))

(defn- eligible-mapping?
  "Decide whether parameter mapping has structure so it can be updated presumably using [[update-mapping]]."
  [{[dim [ref-kind]] :target :as _mapping}]
  (and (= dim :dimension)
       (#{:field :expression} ref-kind)))

(defn- update-mapping
  "Return modified mapping according to action."
  [identifier->action {[_dim field-ref] :target :as mapping}]
  (let [identifier   (mbql-clause->identifier-for-parameter-updates field-ref)
        [action arg] (get identifier->action identifier)]
    (case action
      ;; allowed for now since parameter mappings still use Legacy MBQL fields refs (for now)
      :update (assoc-in mapping [:target 1] (lib/->legacy-MBQL-ref arg))
      mapping)))

(defn- updates-for-dashcards
  [identifier->action dashcards]
  (not-empty (for [{:keys [id parameter_mappings]} dashcards
                   :let [updated (into [] (map #(if (eligible-mapping? %)
                                                  (update-mapping identifier->action %)
                                                  %))
                                       parameter_mappings)]
                   :when (not= parameter_mappings updated)]
               [id {:parameter_mappings updated}])))

(mu/defn- update-associated-parameters!
  "Update _parameter mappings_ of _dashcards_ that target modified _card_, to reflect the modification.

  This function handles only modifications to breakout.

  Context. Card can have multiple multiple breakout elements referencing same field or expression, having different
  _temporal unit_. Those refs can be targeted by dashboard _temporal unit parameter_. If refs change, and card is saved,
  _parameter mappings_ have to be updated to target new, modified refs. This function takes care of that.

  First mappings of _identifier_ -> _action_ are generated. _identifier_ is described
  eg. in [[breakouts->identifier->action]] docstring. Then, dashcards are fetched and updates are generated
  by [[updates-for-dashcards]]. Updates are then executed."
  [card-before :- ::queries.schema/card
   card-after  :- ::queries.schema/card]
  (let [card->breakouts  #(some-> % :dataset_query not-empty lib/breakouts)
        breakouts-before (card->breakouts card-before)
        breakouts-after  (card->breakouts card-after)]
    (when-some [identifier->action (breakouts->identifier->action breakouts-before breakouts-after)]
      (let [dashcards (queries.db/dashcards-for-card (some :id [card-after card-before]))
            updates   (updates-for-dashcards identifier->action dashcards)]
        ;; Beware. This can have negative impact on card update performance as queries are fired in sequence. I'm not
        ;; aware of more reasonable way.
        (when (seq updates)
          (t2/with-transaction [_conn]
            (doseq [[id update] updates]
              (queries.db/update-dashcard! id update))))))))

(deftype SourceCardDependentsGraph []
  graph/Graph
  (children-of [_this key-seq]
    (if (empty? key-seq)
      {}
      (let [deps (queries.db/source-card-dependents key-seq)]
        (u/group-by :source_card_id :id conj #{} deps)))))

(defn- dependent-cards-to-update
  "Return cards to rewrite when `root-card-id` moves off `old-db-id`, with sources before their dependents.
  A card's `database_id` comes from its source card, so updating a dependent first preserves the old ID."
  [root-card-id old-db-id]
  (when-let [all-dep-ids (seq (graph/transitive (->SourceCardDependentsGraph) [root-card-id]))]
    (let [id->card (m/index-by :id (queries.db/cards-queries-info all-dep-ids))]
      (into []
            (comp (map id->card)
                  (filter #(= (get-in % [:dataset_query :database]) old-db-id)))
            all-dep-ids))))

(defn- cascade-database-change-to-dependents!
  "When a card's `database_id` changes, update all cards that use it as a `:source-card` (transitively) so their
  `dataset_query` `:database` key stays in sync. Without this dependent cards would fail with 'Card does not exist'
   because the metadata provider filters cards by database (#74561)."
  [card-before-update card-updates]
  (let [card-id   (:id card-before-update)
        old-db-id (-> card-before-update :dataset_query :database)
        new-db-id (-> card-updates :dataset_query :database)]
    (when (and old-db-id new-db-id (not= old-db-id new-db-id))
      (let [cards-to-update (dependent-cards-to-update card-id old-db-id)]
        (doseq [{dep-id :id, dep-query :dataset_query} cards-to-update]
          (queries.db/update-card! dep-id {:dataset_query (assoc dep-query :database new-db-id)}))))))

(defn- update-card-in-db!
  "Write `card-updates` to the Card and the rows that depend on it, in one transaction."
  [card-before-update card-updates actor delete-old-dashcards?]
  ;; don't block our precious core.async thread, run the actual DB updates on a separate thread
  (t2/with-transaction [_conn]
    (api/maybe-reconcile-collection-position! (select-keys card-before-update [:collection_id :collection_position]) (select-keys card-updates [:collection_id :collection_position]))
    (autoplace-or-remove-dashcards-for-card! card-before-update card-updates delete-old-dashcards?)
    (let [updated-fields (u/select-keys-when card-updates
                                             ;; `collection_id` and `description` can be `nil` (in order to unset them).
                                             ;; Other values should only be modified if they're passed in as non-nil
                                             :present #{:collection_id :collection_position :description :cache_ttl :dashboard_id :document_id :embedding_type}
                                             :non-nil #{:dataset_query :display :name :visualization_settings :archived
                                                        :enable_embedding :type :parameters :parameter_mappings :embedding_params
                                                        :result_metadata :verified-result-metadata?})]
      (models.card/assert-is-valid-dashboard-internal-update card-updates card-before-update)
      (models.card/maybe-unverify! card-before-update updated-fields actor)
      (queries.db/update-card! (:id card-before-update)
                               (m/update-existing updated-fields :dataset_query
                                                  #(lib/normalize ::queries.schema/card.dataset-query.write %)))
      (cache/invalidate-config! {:questions [(:id card-before-update)]
                                 :with-overrides? true}))
    ;; Update all transitively dependent cards if the database was changed (#74561)
    (cascade-database-change-to-dependents! card-before-update card-updates)
    ;; ok, now update dependent dashcard parameters
    (try
      (update-associated-parameters! card-before-update card-updates)
      (catch Throwable e
        (log/errorf "Update of dependent card parameters failed!: %s" (ex-message e))))
    (queries.db/card (:id card-before-update))))

(defn update-card!
  "Update a Card. Metadata is fetched asynchronously. If it is ready before [[metadata-sync-wait-ms]] elapses it will be
  included, otherwise the metadata will be saved to the database asynchronously."
  [{:keys [card-before-update card-updates actor delete-old-dashcards?]}]
  (let [notifications (pulse/alerts-of-card-being-changed card-before-update card-updates)]
    (events/with-batched-events
      (update-card-in-db! card-before-update card-updates actor delete-old-dashcards?))
    ;; Fetch the updated Card from the DB
    (let [card (queries.db/card (:id card-before-update))]
      ;;; TODO -- this should be triggered indirectly by `:event/card-update`
      (pulse/notify-alerts-deleted! :old-card card-before-update, :new-card card, :actor actor
                                    :notifications notifications)
      card)))

(mu/defn delete-card!
  "Hard delete `card`, which the user may write, unless the user may not delete it."
  [card :- :map]
  (api/check-403 (models.card/can-delete? card))
  (queries.db/delete-card! (:id card)))

(defn- update-collection-positions!
  "For cards that have a position in the previous collection, add them to the end of the new collection, trying to
  preserve the order from the original collections. Note it's possible for there to be multiple collections
  (and thus duplicate collection positions) merged into this new collection. No special tie breaker logic for when
  that's the case, just use the order the DB returned it in"
  [new-collection-id-or-nil cards]
  ;; Sorting by `:collection_position` to ensure lower position cards are appended first
  (let [sorted-cards        (sort-by :collection_position cards)
        max-position-result (queries.db/max-collection-position new-collection-id-or-nil)
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
            (queries.db/update-card! (u/the-id card)
                                     {:collection_position idx
                                      :collection_id       new-collection-id-or-nil}))
          ;; These are reversed because of the classic issue when removing an item from array. If we remove an
          ;; item at index 1, everything above index 1 will get decremented. By reversing our processing order we
          ;; can avoid changing the index of cards we haven't yet updated
          (reverse (range starting-position (+ (count sorted-cards) starting-position)))
          (reverse sorted-cards)))))

(defn- write-check-collection-or-root [collection-id-or-nil]
  (if collection-id-or-nil
    (api/write-check :model/Collection collection-id-or-nil)
    (api/write-check collection/root-collection)))

(mu/defn move-cards-to-collection!
  "Move the Cards with `card-ids` into the Collection with `new-collection-id-or-nil` (the root for nil), when the user
  may write the Collections involved and update each Card."
  [new-collection-id-or-nil :- [:maybe ms/PositiveInt]
   card-ids                 :- [:sequential ms/PositiveInt]]
  (write-check-collection-or-root new-collection-id-or-nil)
  ;; for each affected card...
  (when (seq card-ids)
    (let [cards (queries.db/cards-to-move-to-collection (set card-ids) new-collection-id-or-nil)] ; poisioned NULLs = ick
      ;; ...check that we have write permissions for it...
      (doseq [card (t2/hydrate (vec cards) :can_write)]
        (when-not (mi/can-update? card {:collection_id new-collection-id-or-nil})
          (events/publish-event! :event/update-permission-failure {:user-id api/*current-user-id* :object card})
          (api/check-403 false)))
      ;; ...and check that we have write permissions for the old collections, root included
      (doseq [old-collection-id (set (map :collection_id cards))]
        (write-check-collection-or-root old-collection-id))
      ;; Ensure all of the card updates occur in a transaction. Read committed (the default) really isn't what we want
      ;; here. We are querying for the max card position for a given collection, then using that to base our position
      ;; changes if the cards are moving to a different collection. Without repeatable read here, it's possible we'll
      ;; get duplicates
      (events/with-batched-events
        (t2/with-transaction [_conn]
          ;; If any of the cards have a `:collection_position`, we'll need to fixup the old collection now that the cards
          ;; are gone and update the position in the new collection
          (when-let [cards-with-position (seq (filter :collection_position cards))]
            (update-collection-positions! new-collection-id-or-nil cards-with-position))
          (doseq [card  cards
                  :when (not (:collection_position card))]
            (queries.db/update-card! (u/the-id card) {:collection_id new-collection-id-or-nil}))))
      nil))

  (when new-collection-id-or-nil
    (events/publish-event! :event/collection-touch {:collection-id new-collection-id-or-nil :user-id api/*current-user-id*})))

(mu/defn create-public-link! :- ms/NonBlankString
  "The public link UUID of `card`, a Card the user may read, made now when it has none, when the user may share it."
  [card :- :map]
  (let [new-uuid (str (random-uuid))]
    (api/update-check card {:public_uuid new-uuid, :made_public_by_id api/*current-user-id*})
    (public-sharing.validation/check-public-sharing-enabled)
    (api/check-not-archived card)
    (or (queries.db/card-public-uuid (:id card))
        (u/prog1 new-uuid
          (t2/with-transaction [_conn]
            (queries.db/update-card! (:id card)
                                     {:public_uuid       <>
                                      :made_public_by_id api/*current-user-id*}))))))

(mu/defn delete-public-link!
  "Remove the public link of the Card with `card-id`, when the user may share it."
  [card-id :- ::lib.schema.id/card]
  (api/update-check (api/check-404 (queries.db/card card-id)) {:public_uuid nil, :made_public_by_id nil})
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-404 (queries.db/card-exists-with-public-link? card-id))
  (t2/with-transaction [_conn]
    (queries.db/update-card! card-id {:public_uuid nil :made_public_by_id nil}))
  nil)
