(ns metabase-enterprise.audit.pages.table-detail
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase.util.schema :as su]
            [ring.util.codec :as codec]
            [schema.core :as s]))

(s/defn ^:internal-query-fn audit-log
  [table-id :- su/IntGreaterThanZero]
  {:metadata [[:started_at {:display_name "Viewed on",  :base_type :type/DateTime}]
              [:card_id    {:display_name "Card ID",    :base_type :type/Integer, :remapped_to   :query}]
              [:query      {:display_name "Query",      :base_type :type/Text,    :remapped_from :card_id}]
              [:query_hash {:display_name "Query Hash", :base_type :type/Text}]
              [:user_id    {:display_name "User ID",    :base_type :type/Integer, :remapped_to   :user}]
              [:user       {:display_name "Queried by", :base_type :type/Text,    :remapped_from :user_id}]]
   :results (common/reducible-query
             {:select    [:qe.started_at
                          [:card.id :card_id]
                          [(common/card-name-or-ad-hoc :card) :query]
                          [:qe.hash :query_hash]
                          [:u.id :user_id]
                          [(common/user-full-name :u) :user]]
              :from      [[:query_execution :qe]]
              :where     [:= :card.table_id table-id]
              :join      [[:core_user :u] [:= :qe.executor_id :u.id]
                          [:report_card :card] [:= :qe.card_id :card.id]]
              :order-by  [[:qe.started_at :desc]]})
   :xform (map #(update (vec %) 3 codec/base64-encode))})
