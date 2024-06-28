(ns metabase.stale
  (:require [malli.experimental.time]
            [metabase.embed.settings :as embed.settings]
            [metabase.public-settings :as public-settings]
            [metabase.util.honey-sql-2 :as h2x]
            [metabase.util.malli :as mu]
            [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def CollectionIds
  "The set of collection IDs to search for stale content."
  [:set [:maybe integer?]])
(def CutoffDate
  "The cutoff date for stale content."
  :time/local-date)
(def Limit
  "The limit for pagination."
  integer?)
(def Offset
  "The offset for pagination."
  integer?)
(def SortColumn
  "The column to sort by."
  [:enum :name :last_viewed_at :last_viewed_by])
(def SortDirection
  "The direction to sort by."
  [:enum :asc :desc])

(def ^:private FindStaleContentArgs
  [:map {}
   [:collection-ids CollectionIds]
   [:cutoff-date CutoffDate]
   [:limit Limit]
   [:offset Offset]
   [:sort-column SortColumn]
   [:sort-direction SortDirection]])

(defmulti ^:private find-stale-query
  "Find stale content of a given model type."
  (fn [model _args] model))

(defmethod find-stale-query :model/Card
  [_model args]
  {:select [:report_card.id
            [(h2x/literal "Card") :model]
            [[:lower :report_card.name] :name]
            [:last_used_at :last_viewed_at]]
   :from :report_card
   :left-join [:moderation_review [:and
                                   [:= :moderation_review.moderated_item_id :report_card.id]
                                   [:= :moderation_review.moderated_item_type (h2x/literal "card")]
                                   [:= :moderation_review.most_recent true]
                                   [:= :moderation_review.status (h2x/literal "verified")]]
               :pulse_card [:= :pulse_card.card_id :report_card.id]
               :pulse [:and
                       [:= :pulse_card.pulse_id :pulse.id]
                       [:= :pulse.archived false]]
               :sandboxes [:= :sandboxes.card_id :report_card.id]]
   :where [:and
           [:= :sandboxes.id nil]
           [:= :pulse.id nil]
           [:= :moderation_review.id nil]
           [:= :report_card.archived false]
           [:<= :report_card.last_used_at (-> args :cutoff-date)]
           (when (embed.settings/enable-embedding)
             [:= :report_card.enable_embedding false])
           (when (public-settings/enable-public-sharing)
             [:= :report_card.public_uuid nil])
           [:or
            (when (contains? (:collection-ids args) nil)
              [:is :report_card.collection_id nil])
            [:in :report_card.collection_id (-> args :collection-ids)]]]})

(defmethod find-stale-query :model/Dashboard
  [_model args]
  {:select [:report_dashboard.id
            [(h2x/literal "Dashboard") :model]
            [[:lower :report_dashboard.name] :name]
            :last_viewed_at]
   :from :report_dashboard
   :left-join [:pulse [:and
                       [:= :pulse.archived false]
                       [:= :pulse.dashboard_id :report_dashboard.id]]]
   :where [:and
           [:= :pulse.id nil]
           [:= :report_dashboard.archived false]
           [:<= :report_dashboard.last_viewed_at (-> args :cutoff-date)]
           (when (embed.settings/enable-embedding)
             [:= :report_dashboard.enable_embedding false])
           (when (public-settings/enable-public-sharing)
             [:= :report_dashboard.public_uuid nil])
           [:or
            (when (contains? (:collection-ids args) nil)
              [:is :report_dashboard.collection_id nil])
            [:in :report_dashboard.collection_id (-> args :collection-ids)]]]})

(defn- sort-column [column]
  (case column
    :name :name
    :last_viewed_at :last_viewed_at))

(defn- queries [args]
  (for [model [:model/Card :model/Dashboard]]
    (find-stale-query model args)))

(mu/defn ^:private rows-query [args :- FindStaleContentArgs]
  {:select [:id :model]
   :from [[{:union-all (queries args)} :dummy_alias]]
   :order-by [[(sort-column (:sort-column args))
               (:sort-direction args)]]
   :limit (:limit args)
   :offset (:offset args)})

(mu/defn ^:private total-query [args :- FindStaleContentArgs]
  {:select [[:%count.* :count]]
   :from [[{:union-all (queries args)} :dummy_alias]]})

(mu/defn find-candidates
  "Find stale content in the given collections.

  Arguments:

  - `collection-ids`: the set of collection IDs to look for stale content in. Non-recursive, the exact set you pass in
  will be searched

  - `cutoff-date`: if something was last accessed before this date, it is 'stale'

  - `limit` / `offset`: to support pagination

  - `sort-column`: one of `:name` or `:last_viewed_at` (column to sort on)

  - `sort-direction`: `:asc` or `:desc`

  Returns a map containing two keys,

  - `:rows` (a collection of maps containing an `:id` and `:model` field, like `{:id 1 :model :model/Card}`), and

  - `:total` (the total count of stale elements that could be found if you iterated through all pages)
  "
  [args :- FindStaleContentArgs]
  {:rows (->> (t2/query (rows-query args))
              (map #(select-keys % [:id :model]))
              (map (fn [v] (update v :model #(keyword "model" %)))))
   :total (:count (t2/query-one (total-query args)))})
