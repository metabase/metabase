(ns metabase-enterprise.audit.pages.queries
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase-enterprise.audit.pages.common.cards :as cards]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]))

(defn ^:internal-query-fn ^:deprecated  views-and-avg-execution-time-by-day
  "Query that returns data for a two-series timeseries chart with number of queries ran and average query running time
  broken out by day."
  []
  {:metadata [[:day              {:display_name "Date",                   :base_type :type/Date}]
              [:views            {:display_name "Views",                  :base_type :type/Integer}]
              [:avg_running_time {:display_name "Avg. Running Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
              {:select   [[(hx/cast :date :started_at) :day]
                          [:%count.* :views]
                          [:%avg.running_time :avg_running_time]]
               :from     [:query_execution]
               :group-by [(hx/cast :date :started_at)]
               :order-by [[(hx/cast :date :started_at) :asc]]})})

(defn ^:internal-query-fn most-popular
  "Query that returns the 10 most-popular Cards based on number of query executions, in descending order."
  []
  {:metadata [[:card_id    {:display_name "Card ID",    :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name  {:display_name "Card",       :base_type :type/Title,   :remapped_from :card_id}]
              [:executions {:display_name "Executions", :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:select   [[:c.id :card_id]
                          [:c.name :card_name]
                          [:%count.* :executions]]
               :from     [[:query_execution :qe]]
               :join     [[:report_card :c] [:= :qe.card_id :c.id]]
               :group-by [:c.id]
               :order-by [[:executions :desc]]
               :limit    10})})

(defn ^:internal-query-fn ^:deprecated slowest
  "Query that returns the 10 slowest-running Cards based on average query execution time, in descending order."
  []
  {:metadata [[:card_id          {:display_name "Card ID",                :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name        {:display_name "Card",                   :base_type :type/Title,   :remapped_from :card_id}]
              [:avg_running_time {:display_name "Avg. Running Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
              {:select   [[:c.id :card_id]
                          [:c.name :card_name]
                          [:%avg.running_time :avg_running_time]]
               :from     [[:query_execution :qe]]
               :join     [[:report_card :c] [:= :qe.card_id :c.id]]
               :group-by [:c.id]
               :order-by [[:avg_running_time :desc]]
               :limit    10})})

(s/defn ^:internal-query-fn table
  "A list of all questions."
  ([]
   (table nil))
  ([query-string :- (s/maybe s/Str)]
   {:metadata [[:card_id         {:display_name "Card ID",       :base_type :type/Integer, :remapped_to   :card_name}]
               [:card_name       {:display_name "Name",          :base_type :type/Name,    :remapped_from :card_id}]
               [:collection_id   {:display_name "Collection ID", :base_type :type/Integer, :remapped_to   :collection_name}]
               [:collection_name {:display_name "Collection",    :base_type :type/Text,    :remapped_from :collection_id}]
               [:database_id     {:display_name "Database ID",   :base_type :type/Integer, :remapped_to   :database_name}]
               [:database_name   {:display_name "Database",      :base_type :type/Text,    :remapped_from :database_id}]
               [:table_id        {:display_name "Table ID",      :base_type :type/Integer, :remapped_to   :table_name}]
               [:table_name      {:display_name "Table",         :base_type :type/Text,    :remapped_from :table_id}]
               [:user_id         {:display_name "Created By ID", :base_type :type/Integer, :remapped_to   :user_name}]
               [:user_name       {:display_name "Created By",    :base_type :type/Text,    :remapped_from :user_id}]
               [:public_link     {:display_name "Public Link",   :base_type :type/URL}]
               [:cache_ttl       {:display_name "Cache TTL",     :base_type :type/Number}]
               [:total_views     {:display_name "Views",         :base_type :type/Integer}]]
    :results  (common/reducible-query
                (->
                 {:with      [cards/avg-exec-time
                              cards/views]
                  :select    [[:card.id :card_id]
                              [:card.name :card_name]
                              :collection_id
                              [:coll.name :collection_name]
                              :card.database_id
                              [:db.name :database_name]
                              :card.table_id
                              [:t.name :table_name]
                              [:card.creator_id :user_id]
                              [(common/user-full-name :u) :user_name]
                              [(common/card-public-url :card.public_uuid) :public_link]
                              :card.cache_ttl
                              [:card_views.count :total_views]]
                  :from      [[:report_card :card]]
                  :left-join [[:collection :coll]      [:= :card.collection_id :coll.id]
                              [:metabase_database :db] [:= :card.database_id :db.id]
                              [:metabase_table :t]     [:= :card.table_id :t.id]
                              [:core_user :u]          [:= :card.creator_id :u.id]
                              :avg_exec_time           [:= :card.id :avg_exec_time.card_id]
                              :card_views              [:= :card.id :card_views.card_id]]
                  :where     [:= :card.archived false]
                  :order-by  [[:%lower.card.name :asc]]}
                 (common/add-search-clause query-string :card.name)))}))
