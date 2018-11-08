(ns metabase.models.card
  "Underlying DB model for what is now most commonly referred to as a 'Question' in most user-facing situations. Card
  is a historical name, but is the same thing; both terms are used interchangeably in the backend codebase."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api.common :as api :refer [*current-user-id*]]
            [metabase.api.common :as api :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [dependency :as dependency]
             [field-values :as field-values]
             [interface :as i]
             [params :as params]
             [permissions :as perms]
             [query :as query]
             [revision :as revision]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.query-processor.util :as qputil]
            [metabase.util.i18n :as ui18n :refer [tru]]
            [toucan
             [db :as db]
             [models :as models]]
            [metabase.mbql.normalize :as normalize]))

(models/defmodel Card :report_card)


;;; -------------------------------------------------- Hydration --------------------------------------------------

(defn dashboard-count
  "Return the number of Dashboards this Card is in."
  {:hydrate :dashboard_count}
  [{:keys [id]}]
  (db/count 'DashboardCard, :card_id id))


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
  "Lift `database_id`, `table_id`, and `query_type` from query definition."
  [{{query-type :type, :as outer-query} :dataset_query, :as card}]
  (merge (when-let [{:keys [database-id table-id]} (and query-type
                                                        (query/query->database-and-table-ids outer-query))]
           {:database_id database-id
            :table_id    table-id
            :query_type  (keyword query-type)})
         card))

(defn- check-for-circular-source-query-references
  "Check that a `card`, if it is using another Card as its source, does not have circular references between source
  Cards. (e.g. Card A cannot use itself as a source, or if A uses Card B as a source, Card B cannot use Card A, and so
  forth.)"
  [{query :dataset_query, id :id}] ; don't use `u/get-id` here so that we can use this with `pre-insert` too
  (loop [query query, ids-already-seen #{id}]
    (let [source-card-id (qputil/query->source-card-id query)]
      (cond
        (not source-card-id)
        :ok

        (ids-already-seen source-card-id)
        (throw
         (ui18n/ex-info (tru "Cannot save Question: source query has circular references.")
           {:status-code 400}))

        :else
        (recur (or (db/select-one-field :dataset_query Card :id source-card-id)
                   (throw (ui18n/ex-info (tru "Card {0} does not exist." source-card-id)
                            {:status-code 404})))
               (conj ids-already-seen source-card-id))))))

(defn- maybe-normalize-query [card]
  (cond-> card
    (:dataset_query card) (update :dataset_query normalize/normalize)))

(defn- pre-insert [{query :dataset_query, :as card}]
  ;; TODO - we usually check permissions to save/update stuff in the API layer rather than here in the Toucan
  ;; model-layer functions... Not saying one pattern is better than the other (although this one does make it harder
  ;; to do the wrong thing) but we should try to be consistent
  (u/prog1 card
    ;; Make sure the User saving the Card has the appropriate permissions to run its query. We don't want Users saving
    ;; Cards with queries they wouldn't be allowed to run!
    (when *current-user-id*
      (when-not (query-perms/can-run-query? query)
        (throw (Exception. (str (tru "You do not have permissions to run ad-hoc native queries against Database {0}."
                                     (:database query)))))))
    ;; make sure this Card doesn't have circular source query references
    (check-for-circular-source-query-references card)))

(defn- post-insert [card]
  ;; if this Card has any native template tag parameters we need to update FieldValues for any Fields that are
  ;; eligible for FieldValues and that belong to a 'On-Demand' database
  (u/prog1 card
    (when-let [field-ids (seq (params/card->template-tag-field-ids card))]
      (log/info "Card references Fields in params:" field-ids)
      (field-values/update-field-values-for-on-demand-dbs! field-ids))))

(defn- pre-update [{archived? :archived, :as card}]
  ;; TODO - don't we need to be doing the same permissions check we do in `pre-insert` if the query gets changed? Or
  ;; does that happen in the `PUT` endpoint?
  (u/prog1 card
    ;; if the Card is archived, then remove it from any Dashboards
    (when archived?
      (db/delete! 'DashboardCard :card_id (u/get-id card)))
    ;; if the template tag params for this Card have changed in any way we need to update the FieldValues for
    ;; On-Demand DB Fields
    (when (and (:dataset_query card)
               (:native (:dataset_query card)))
      (let [old-param-field-ids (params/card->template-tag-field-ids (db/select-one [Card :dataset_query]
                                                                       :id (u/get-id card)))
            new-param-field-ids (params/card->template-tag-field-ids card)]
        (when (and (seq new-param-field-ids)
                   (not= old-param-field-ids new-param-field-ids))
          (let [newly-added-param-field-ids (set/difference new-param-field-ids old-param-field-ids)]
            (log/info "Referenced Fields in Card params have changed. Was:" old-param-field-ids
                      "Is Now:" new-param-field-ids
                      "Newly Added:" newly-added-param-field-ids)
            ;; Now update the FieldValues for the Fields referenced by this Card.
            (field-values/update-field-values-for-on-demand-dbs! newly-added-param-field-ids)))))
    ;; make sure this Card doesn't have circular source query references if we're updating the query
    (when (:dataset_query card)
      (check-for-circular-source-query-references card))))

(defn- pre-delete [{:keys [id]}]
  (db/delete! 'PulseCard :card_id id)
  (db/delete! 'Revision :model "Card", :model_id id)
  (db/delete! 'DashboardCardSeries :card_id id)
  (db/delete! 'DashboardCard :card_id id)
  (db/delete! 'CardFavorite :card_id id))


(u/strict-extend (class Card)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:card])
          :types          (constantly {:dataset_query          :metabase-query
                                       :description            :clob
                                       :display                :keyword
                                       :embedding_params       :json
                                       :query_type             :keyword
                                       :result_metadata        :json
                                       :visualization_settings :json})
          :properties     (constantly {:timestamped? true})
          ;; Make sure we normalize the query before calling `pre-update` or `pre-insert` because some of the
          ;; functions those fns call assume normalized queries
          :pre-update     (comp populate-query-fields pre-update maybe-normalize-query)
          :pre-insert     (comp populate-query-fields pre-insert maybe-normalize-query)
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
