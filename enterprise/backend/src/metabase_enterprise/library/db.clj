(ns metabase-enterprise.library.db
  "Application database queries for the library module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn card-types-in-collections
  "The set of Card types present in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-fn-set :type [:model/Card :type] :collection_id [:in collection-ids]))

(mu/defn published-table-in-collections?
  "Whether a published Table exists in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/exists? :model/Table :is_published true :collection_id [:in collection-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn dashboard-in-collections?
  "Whether a Dashboard exists in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/exists? :model/Dashboard :collection_id [:in collection-ids]))

(mu/defn non-library-card-ids
  "The ids among `card-ids` of Cards that are outside every Library Collection."
  [card-ids :- [:set {:min 1} ::lib.schema.id/card]]
  (t2/select-pks-set :model/Card
                     {:where [:and
                              [:in :id [:auto/param (vec card-ids)]]
                              [:or
                               [:= :collection_id nil]
                               [:not-in :collection_id ^:allow-subquery {:select [:id]
                                                                         :from   [:collection]
                                                                         :where  [:in :type (vec collection/library-collection-types)]}]]]}))

(def ^:private library-dashboard-ids-subquery
  ^:allow-subquery {:select [:d.id]
                    :from   [[:report_dashboard :d]]
                    :join   [[:collection :c] [:= :c.id :d.collection_id]]
                    :where  [:= :c.type collection/library-dashboards-collection-type]})

(mu/defn library-dashboard?
  "Whether the Dashboard with `dashboard-id` is in a Library dashboards Collection."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/exists? :model/Dashboard {:where [:and
                                        [:= :id [:auto/param dashboard-id]]
                                        [:in :id library-dashboard-ids-subquery]]}))

(mu/defn library-dashcard-dashboard-id
  "The Dashboard id of the DashboardCard with `dashcard-id`, if that Dashboard is in a Library dashboards Collection."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one-fn :dashboard_id [:model/DashboardCard :dashboard_id]
                    {:where [:and
                             [:= :id [:auto/param dashcard-id]]
                             [:in :dashboard_id library-dashboard-ids-subquery]]}))

(mu/defn collection-ids-of-types
  "The ids among `collection-ids` of Collections whose type is one of `types`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   types          :- [:sequential :string]]
  (t2/select-pks-set :model/Collection :id [:in collection-ids] :type [:in types]))

(mu/defn dashboard-referenced-card-ids
  "The ids among `card-ids` that the Dashboard with `dashboard-id` already references, as a DashboardCard's Card or as
  a series."
  [dashboard-id :- ::lib.schema.id/dashboard
   card-ids     :- [:set {:min 1} ::lib.schema.id/card]]
  (into (t2/select-fn-set :card_id :model/DashboardCard
                          :dashboard_id dashboard-id
                          :card_id [:in (vec card-ids)])
        (t2/select-fn-set :card_id :model/DashboardCardSeries
                          :card_id [:in (vec card-ids)]
                          {:where [:in :dashboardcard_id
                                   ^:allow-subquery {:select [:id]
                                                     :from   [(t2/table-name :model/DashboardCard)]
                                                     :where  [:= :dashboard_id dashboard-id]}]})))

(mu/defn library-dashboards-referencing-card
  "The Dashboards, trashed ones included, in a Library dashboards Collection that reference the Card with `card-id`
  as a DashboardCard's Card or as a series, ordered by name."
  [card-id :- ::lib.schema.id/card]
  (t2/select [:model/Dashboard :id :name :archived]
             {:where    [:and
                         [:in :collection_id ^:allow-subquery {:select [:id]
                                                               :from   [:collection]
                                                               :where  [:= :type collection/library-dashboards-collection-type]}]
                         [:or
                          [:in :id ^:allow-subquery {:select [:dashboard_id]
                                                     :from   [(t2/table-name :model/DashboardCard)]
                                                     :where  [:= :card_id [:auto/param card-id]]}]
                          [:in :id ^:allow-subquery {:select [:dc.dashboard_id]
                                                     :from   [[(t2/table-name :model/DashboardCardSeries) :s]]
                                                     :join   [[(t2/table-name :model/DashboardCard) :dc]
                                                              [:= :dc.id :s.dashboardcard_id]]
                                                     :where  [:= :s.card_id [:auto/param card-id]]}]]]
              :order-by [[:name :asc]]}))

(mu/defn library-collections
  "The readable Library Collections, ordered by name."
  []
  (t2/select :model/Collection
             {:where    [:and
                         [:in :type (vec collection/library-collection-types)]
                         (collection/visible-collection-filter-clause
                          :id
                          {:include-archived-items    :exclude
                           :include-trash-collection? false
                           :permission-level          :read
                           :archive-operation-id      nil})]
              :order-by [[:%lower.name :asc]]}))

(mu/defn collection-type
  "The type of the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :type [:model/Collection :type] :id collection-id))

(mu/defn unarchived-card-collection-types-reducible
  "Reducible distinct Collection ID and Card type pairs of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:= :archived false]}))
