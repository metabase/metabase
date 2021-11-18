(ns metabase.models.card
  "Underlying DB model for what is now most commonly referred to as a 'Question' in most user-facing situations. Card
  is a historical name, but is the same thing; both terms are used interchangeably in the backend codebase."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase.mbql.normalize :as normalize]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.collection :as collection]
            [metabase.models.dependency :as dependency :refer [Dependency]]
            [metabase.models.field-values :as field-values]
            [metabase.models.interface :as i]
            [metabase.models.params :as params]
            [metabase.models.permissions :as perms]
            [metabase.models.query :as query]
            [metabase.models.revision :as revision]
            [metabase.moderation :as moderation]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor.util :as qputil]
            [metabase.server.middleware.session :as session]
            [metabase.util :as u]
            [metabase.util.i18n :as ui18n :refer [tru]]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel Card :report_card)


;;; -------------------------------------------------- Hydration --------------------------------------------------

(defn dashboard-count
  "Return the number of Dashboards this Card is in."
  {:hydrate :dashboard_count}
  [{:keys [id]}]
  (db/count 'DashboardCard, :card_id id))

(defn dashboard-cards
  "Return the corresponding dashboard cards for this Card"
  {:hydrate :dashboard_cards}
  [{:keys [id]}]
  (db/select 'DashboardCard, :card_id id))

(defn multi-cards
  "Return the cards which are other cards with respect to this card
  in multiple series display for dashboard.

  Dashboard (and dashboard only) has this thing where you're displaying multiple cards entirely.

  This is actually completely different from the combo display,
  which is a visualization type in visualization option.

  This is also actually completely different from having multiple series display
  from the visualization with same type (line bar or whatever),
  which is a separate option in line area or bar visualization"
  {:hydrate :multi_cards}
  [{:keys [id]}]
  (db/query {:select [:dashcard.* :dashcardseries.* :card.*]
             :from [['DashboardCard :dashcard]]
             :left-join [['DashboardCardSeries :dashcardseries]
                         [:= :dashcardseries.dashcard_id :dashcard.id]
                         ['Card :card]
                         [:= :dashcardseries.card_id :card.id]]
             :where [:and
                     [:or
                      [:= :card.archived false]
                      [:= :card.archived nil]]
                     [:= :card_id id]]}))

(defn average-query-time
  "Average query time of card, taken by query executions which didn't hit cache.
  If it's nil we don't have any query executions on file"
  {:hydrate :average_query_time}
  [{:keys [id]}]
  (-> (db/query {:select [:%avg.running_time]
                 :from [:query_execution]
                 :where [:and
                         [:not= :running_time nil]
                         [:not= :cache_hit true]
                         [:= :card_id id]]})
      first vals first))

(defn last-query-start
  "Timestamp for start of last query of this card."
  {:hydrate :last_query_start}
  [{:keys [id]}]
  (-> (db/query {:select [:%max.started_at]
                 :from [:query_execution]
                 :where [:and
                         [:not= :running_time nil]
                         [:not= :cache_hit true]
                         [:= :card_id id]]})
      first vals first))

;; There's more hydration in the shared metabase.moderation namespace, but it needs to be required:
(comment moderation/keep-me)

;;; -------------------------------------------------- Dependencies --------------------------------------------------

(defn- extract-ids
  "Get all the Segment or Metric IDs referenced by a query."
  [segment-or-metric query]
  (set
   (case segment-or-metric
     :segment (mbql.u/match query [:segment id] id)
     :metric  (mbql.u/match query [:metric  id] id))))

(defn card-dependencies
  "Calculate any dependent objects for a given `card`."
  ([_ _ card]
   (card-dependencies card))
  ([{{query-type :type, inner-query :query} :dataset_query}]
   (when (= :query query-type)
     {:Metric  (extract-ids :metric inner-query)
      :Segment (extract-ids :segment inner-query)})))


;;; --------------------------------------------------- Revisions ----------------------------------------------------

(defn serialize-instance
  "Serialize a `Card` for use in a `Revision`."
  ([instance]
   (serialize-instance nil nil instance))
  ([_ _ instance]
   (dissoc instance :created_at :updated_at :result_metadata)))


;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(defn populate-query-fields
  "Lift `database_id`, `table_id`, and `query_type` from query definition when inserting/updating a Card."
  [{{query-type :type, :as outer-query} :dataset_query, :as card}]
  (merge (when-let [{:keys [database-id table-id]} (and query-type
                                                        (query/query->database-and-table-ids outer-query))]
           {:database_id database-id
            :table_id    table-id
            :query_type  (keyword query-type)})
         card))

(defn- populate-result-metadata
  "When inserting/updating a Card, populate the result metadata column if not already populated by inferring the
  metadata from the query."
  [{query :dataset_query, metadata :result_metadata, existing-card-id :id, :as card}]
  (cond
    ;; not updating the query => no-op
    (not query)
    (do
      (log/debug "Not inferring result metadata for Card: query was not updated")
      card)

    ;; passing in metadata => no-op
    metadata
    (do
      (log/debug "Not inferring result metadata for Card: metadata was passed in to insert!/update!")
      card)

    ;; this is an update, and dataset_query hasn't changed => no-op
    (and existing-card-id
         (= query (db/select-one-field :dataset_query Card :id existing-card-id)))
    (do
      (log/debugf "Not inferring result metadata for Card %s: query has not changed" existing-card-id)
      card)

    ;; query has changed (or new Card) and this is a native query => set metadata to nil
    ;;
    ;; we can't infer the metadata for a native query without running it, so it's better to have no metadata than
    ;; possibly incorrect metadata.
    (= (:type query) :native)
    (do
      (log/debug "Can't infer result metadata for Card: query is a native query. Setting result metadata to nil")
      (assoc card :result_metadata nil))

    ;; otherwise, attempt to infer the metadata. If the query can't be run for one reason or another, set metadata to
    ;; nil.
    :else
    (do
      (log/debug "Attempting to infer result metadata for Card")
      (let [inferred-metadata (not-empty (session/with-current-user nil
                                           (classloader/require 'metabase.query-processor)
                                           (u/ignore-exceptions
                                             ((resolve 'metabase.query-processor/query->expected-cols) query))))]
        (assoc card :result_metadata inferred-metadata)))))

(defn- check-for-circular-source-query-references
  "Check that a `card`, if it is using another Card as its source, does not have circular references between source
  Cards. (e.g. Card A cannot use itself as a source, or if A uses Card B as a source, Card B cannot use Card A, and so
  forth.)"
  [{query :dataset_query, id :id}]      ; don't use `u/the-id` here so that we can use this with `pre-insert` too
  (loop [query query, ids-already-seen #{id}]
    (let [source-card-id (qputil/query->source-card-id query)]
      (cond
        (not source-card-id)
        :ok

        (ids-already-seen source-card-id)
        (throw
         (ex-info (tru "Cannot save Question: source query has circular references.")
                  {:status-code 400}))

        :else
        (recur (or (db/select-one-field :dataset_query Card :id source-card-id)
                   (throw (ex-info (tru "Card {0} does not exist." source-card-id)
                                   {:status-code 404})))
               (conj ids-already-seen source-card-id))))))

(defn- maybe-normalize-query [card]
  (cond-> card
    (seq (:dataset_query card)) (update :dataset_query normalize/normalize)))

(defn- pre-insert [{query :dataset_query, :as card}]
  (u/prog1 card
    ;; make sure this Card doesn't have circular source query references
    (check-for-circular-source-query-references card)
    (collection/check-collection-namespace Card (:collection_id card))))

(defn- post-insert [card]
  ;; if this Card has any native template tag parameters we need to update FieldValues for any Fields that are
  ;; eligible for FieldValues and that belong to a 'On-Demand' database
  (u/prog1 card
    (when-let [field-ids (seq (params/card->template-tag-field-ids card))]
      (log/info "Card references Fields in params:" field-ids)
      (field-values/update-field-values-for-on-demand-dbs! field-ids))))

(defonce
  ^{:doc "Atom containing a function used to check additional sandboxing constraints for Metabase Enterprise Edition.
  This is called as part of the `pre-update` method for a Card.

  For the OSS edition, there is no implementation for this function -- it is a no-op. For Metabase Enterprise Edition,
  the implementation of this function is
  [[metabase-enterprise.sandbox.models.group-table-access-policy/update-card-check-gtaps]] and is installed by that
  namespace."} pre-update-check-sandbox-constraints
  (atom identity))

(defn- pre-update [{archived? :archived, id :id, :as changes}]
  ;; TODO - don't we need to be doing the same permissions check we do in `pre-insert` if the query gets changed? Or
  ;; does that happen in the `PUT` endpoint?
  (u/prog1 changes
    ;; if the Card is archived, then remove it from any Dashboards
    (when archived?
      (db/delete! 'DashboardCard :card_id id))
    ;; if the template tag params for this Card have changed in any way we need to update the FieldValues for
    ;; On-Demand DB Fields
    (when (get-in changes [:dataset_query :native])
      (let [old-param-field-ids (params/card->template-tag-field-ids (db/select-one [Card :dataset_query] :id id))
            new-param-field-ids (params/card->template-tag-field-ids changes)]
        (when (and (seq new-param-field-ids)
                   (not= old-param-field-ids new-param-field-ids))
          (let [newly-added-param-field-ids (set/difference new-param-field-ids old-param-field-ids)]
            (log/info "Referenced Fields in Card params have changed. Was:" old-param-field-ids
                      "Is Now:" new-param-field-ids
                      "Newly Added:" newly-added-param-field-ids)
            ;; Now update the FieldValues for the Fields referenced by this Card.
            (field-values/update-field-values-for-on-demand-dbs! newly-added-param-field-ids)))))
    ;; make sure this Card doesn't have circular source query references if we're updating the query
    (when (:dataset_query changes)
      (check-for-circular-source-query-references changes))
    (collection/check-collection-namespace Card (:collection_id changes))
    ;; additional checks (Enterprise Edition only)
    (@pre-update-check-sandbox-constraints changes)))

;; Cards don't normally get deleted (they get archived instead) so this mostly affects tests
(defn- pre-delete [{:keys [id]}]
  (db/delete! 'ModerationReview :moderated_item_type "card", :moderated_item_id id)
  (db/delete! 'Revision :model "Card", :model_id id)
  (db/delete! 'Dependency :model "Card", :model_id id))

(defn- result-metadata-out
  "Transform the Card result metadata as it comes out of the DB. Convert columns to keywords where appropriate."
  [metadata]
  (when-let [metadata (not-empty (i/json-out-with-keywordization metadata))]
    (seq (map normalize/normalize-source-metadata metadata))))

(models/add-type! ::result-metadata
  :in i/json-in
  :out result-metadata-out)

(u/strict-extend (class Card)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:card])
          :types          (constantly {:dataset_query          :metabase-query
                                       :display                :keyword
                                       :embedding_params       :json
                                       :query_type             :keyword
                                       :result_metadata        ::result-metadata
                                       :visualization_settings :visualization-settings})
          :properties     (constantly {:timestamped? true})
          ;; Make sure we normalize the query before calling `pre-update` or `pre-insert` because some of the
          ;; functions those fns call assume normalized queries
          :pre-update     (comp populate-query-fields pre-update populate-result-metadata maybe-normalize-query)
          :pre-insert     (comp populate-query-fields pre-insert populate-result-metadata maybe-normalize-query)
          :post-insert    post-insert
          :pre-delete     pre-delete
          :post-select    public-settings/remove-public-uuid-if-public-sharing-is-disabled})

  ;; You can read/write a Card if you can read/write its parent Collection
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection

  revision/IRevisioned
  (assoc revision/IRevisionedDefaults
         :serialize-instance serialize-instance)

  dependency/IDependent
  {:dependencies card-dependencies})
