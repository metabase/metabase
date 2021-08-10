(ns metabase-enterprise.audit.pages.query-detail
  "Queries to show details about a (presumably ad-hoc) query." (:require [cheshire.core :as json]
            [metabase-enterprise.audit.pages.common :as common]
            [metabase.util.schema :as su]
            [ring.util.codec :as codec]
            [schema.core :as s]))

(s/defn ^:internal-query-fn details
  "Details about a specific query (currently just average execution time)."
  [query-hash :- su/NonBlankString]
  {:metadata [[:query                  {:display_name "Query",                :base_type :type/Dictionary}]
              [:average_execution_time {:display_name "Avg. Exec. Time (ms)", :base_type :type/Number}]]
   :results  (common/reducible-query
              {:select [:query
                        :average_execution_time]
               :from   [:query]
               :where  [:= :query_hash (codec/base64-decode query-hash)]
               :limit  1})
   :xform (map #(update (vec %) 0 json/parse-string))})

(s/defn ^:internal-query-fn bad-details
  "For the modal view drilling down into a bad question"
  [card-id :- su/IntGreaterThanZero]
  {:metadata [[:card_id         {:display_name "Card ID",         :base_type :type/Integer}]
              [:card_name       {:display_name "Name",            :base_type :type/Name}]
              [:collection_id   {:display_name "Collection ID",   :base_type :type/Integer}]
              [:collection_name {:display_name "Collection",      :base_type :type/Text}]
              [:database_id     {:display_name "Database ID",     :base_type :type/Integer}]
              [:database_name   {:display_name "Database",        :base_type :type/Text}]
              [:dashboard_cards {:display_name "Dashboard Cards", :base_type :type/*}]
              [:card_query      {:display_name "Query",           :base_type :type/*}]
              [:table_id        {:display_name "Table ID",        :base_type :type/Integer}] 
              [:table_name      {:display_name "Table",           :base_type :type/Text}]
              [:user_id         {:display_name "Created By ID",   :base_type :type/Integer}]
              [:user_name       {:display_name "Created By",      :base_type :type/Text}]
              [:last_error      {:display_name "Error",           :base_type :type/Text}]]
   :results (common/reducible-query
              {:select    [[:card.id :card_id]
                           [:card.name :card_name]
                           :collection_id
                           [:coll.name :collection_name]
                           :card.database_id
                           [:db.name :database_name]
                           :card.table_id
                           [:t.name :table_name]
                           [:card.creator_id :user_id]
                           [(common/user-full-name :u) :user_name]
                           [:qe.error :error]]
               :from      [[:report_card :card]]
               :left-join [[:collection :coll]      [:= :card.collection_id :coll.id]
                           [:metabase_database :db] [:= :card.database_id :db.id]
                           [:metabase_table :t]     [:= :card.table_id :t.id]
                           [:core_user :u]          [:= :card.creator_id :u.id]
                           [:query_execution :qe]   [:= :card.id :qe.id]]
               :where     [:= :card.id card-id]})})
