(ns metabase-enterprise.audit.pages.dashboard-detail
  "Detail page for a single dashboard."
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase-enterprise.audit.pages.common.card-and-dashboard-detail :as card-and-dash-detail]
            [metabase-enterprise.audit.pages.common.cards :as cards]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(s/defn ^:internal-query-fn views-by-time
  "Get views of a Dashboard broken out by a time `unit`, e.g. `day` or `day-of-week`."
  [dashboard-id :- su/IntGreaterThanZero, datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/views-by-time "dashboard" dashboard-id datetime-unit))

(s/defn ^:internal-query-fn revision-history
  [dashboard-id :- su/IntGreaterThanZero]
  (card-and-dash-detail/revision-history Dashboard dashboard-id))

(s/defn ^:internal-query-fn audit-log
  [dashboard-id :- su/IntGreaterThanZero]
  (card-and-dash-detail/audit-log "dashboard" dashboard-id))


(s/defn ^:internal-query-fn cards
  [dashboard-id :- su/IntGreaterThanZero]
  {:metadata [[:card_id             {:display_name "Card ID",              :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name           {:display_name "Title",                :base_type :type/Name,    :remapped_from :card_id}]
              [:collection_id       {:display_name "Collection ID",        :base_type :type/Integer, :remapped_to   :collection_name}]
              [:collection_name     {:display_name "Collection",           :base_type :type/Text,    :remapped_from :collection_id}]
              [:created_at          {:display_name  "Created At",          :base_type :type/DateTime}]
              [:database_id         {:display_name "Database ID",          :base_type :type/Integer, :remapped_to   :database_name}]
              [:database_name       {:display_name "Database",             :base_type :type/Text,    :remapped_from :database_id}]
              [:table_id            {:display_name "Table ID",             :base_type :type/Integer, :remapped_to   :table_name}]
              [:table_name          {:display_name "Table",                :base_type :type/Text,    :remapped_from :table_id}]
              [:avg_running_time_ms {:display_name "Avg. exec. time (ms)", :base_type :type/Number}]
              [:cache_ttl           {:display_name "Cache TTL",            :base_type :type/Number}]
              [:public_link         {:display_name "Public Link",          :base_type :type/URL}]
              [:total_views         {:display_name "Total Views",          :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:with      [[:card {:select [:card.*
                                            [:dc.created_at :dashcard_created_at]]
                                   :from   [[:report_dashboardcard :dc]]
                                   :join   [[:report_card :card] [:= :card.id :dc.card_id]]
                                   :where  [:= :dc.dashboard_id dashboard-id]}]
                           cards/avg-exec-time
                           cards/views]
               :select    [[:card.id :card_id]
                           [:card.name :card_name]
                           [:coll.id :collection_id]
                           [:coll.name :collection_name]
                           [:card.dashcard_created_at :created_at]
                           :card.database_id
                           [:db.name :database_name]
                           :card.table_id
                           [:t.name :table_name]
                           :avg_exec_time.avg_running_time_ms
                           [(common/card-public-url :card.public_uuid) :public_link]
                           :card.cache_ttl
                           [:card_views.count :total_views]]
               :from      [:card]
               :left-join [:avg_exec_time           [:= :card.id :avg_exec_time.card_id]
                           [:metabase_database :db] [:= :card.database_id :db.id]
                           [:metabase_table :t]     [:= :card.table_id :t.id]
                           [:collection :coll]      [:= :card.collection_id :coll.id]
                           :card_views              [:= :card.id :card_views.card_id]]
               :order-by  [[:%lower.card.name :asc]]})})
