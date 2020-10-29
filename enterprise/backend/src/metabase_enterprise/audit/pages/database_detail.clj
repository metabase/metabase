(ns metabase-enterprise.audit.pages.database-detail
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase.util.schema :as su]
            [ring.util.codec :as codec]
            [schema.core :as s]))

(s/defn ^:internal-query-fn audit-log
  [database-id :- su/IntGreaterThanZero]
  {:metadata [[:started_at {:display_name "Viewed on",  :base_type :type/DateTime}]
              [:card_id    {:display_name "Card ID",    :base_type :type/Integer, :remapped_to   :query}]
              [:query_hash {:display_name "Query Hash", :base_type :type/Text}]
              [:query      {:display_name "Query",      :base_type :type/Text,    :remapped_from :card_id}]
              [:user_id    {:display_name "User ID",    :base_type :type/Integer, :remapped_to   :user}]
              [:user       {:display_name "Queried by", :base_type :type/Text,    :remapped_from :user_id}]
              [:schema     {:display_name "Schema",     :base_type :type/Text}]
              [:table_id   {:display_name "Table ID",   :base_type :type/Integer, :remapped_to   :table}]
              [:table      {:display_name "Table",      :base_type :type/Text,    :remapped_from :table_id}]]
   :results (common/reducible-query
                  {:select    [:qe.started_at
                               [:card.id :card_id]
                               [:qe.hash :query_hash]
                               [(common/card-name-or-ad-hoc :card) :query]
                               [:u.id :user_id]
                               [(common/user-full-name :u) :user]
                               :t.schema
                               [:t.id :table_id]
                               [:t.name :table]]
                   :from      [[:query_execution :qe]]
                   :where     [:= :qe.database_id database-id]
                   :join      [[:metabase_database :db] [:= :db.id :qe.database_id]
                               [:core_user :u] [:= :qe.executor_id :u.id]]
                   :left-join [[:report_card :card] [:= :qe.card_id :card.id]
                               [:metabase_table :t] [:= :card.table_id :t.id]]
                   :order-by  [[:qe.started_at :desc]]})
   :xform   (map #(update (vec %) 2 codec/base64-encode))})
