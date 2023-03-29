(ns metabase-enterprise.audit-app.pages.query-detail
  "Queries to show details about a (presumably ad-hoc) query."
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase-enterprise.audit-app.pages.common :as common]
   [metabase-enterprise.audit-app.pages.common.cards :as cards]
   [metabase.util.schema :as su]
   [ring.util.codec :as codec]
   [schema.core :as s]))

(defmethod audit.i/internal-query ::bad-card
  [_ card-id]
  {:metadata [[:card_id         {:display_name "Question ID",        :base_type :type/Integer :remapped_from :card_name}]
              [:card_name       {:display_name "Question",           :base_type :type/Text    :remapped_from :card_id}]
              [:error_str       {:display_name "Error",              :base_type :type/Text    :code          true}]
              [:collection_id   {:display_name "Collection ID",      :base_type :type/Integer :remapped_to   :collection_name}]
              [:collection_name {:display_name "Collection",         :base_type :type/Text    :remapped_from :collection_id}]
              [:database_id     {:display_name "Database ID",        :base_type :type/Integer :remapped_to   :database_name}]
              [:database_name   {:display_name "Database",           :base_type :type/Text    :remapped_from :database_id}]
              [:schema_name     {:display_name "Schema",             :base_type :type/Text}]
              [:table_id        {:display_name "Table ID",           :base_type :type/Integer :remapped_to   :table_name}]
              [:table_name      {:display_name "Table",              :base_type :type/Text    :remapped_from :table_id}]
              [:last_run_at     {:display_name "Last run at",        :base_type :type/DateTime}]
              [:total_runs      {:display_name "Total runs",         :base_type :type/Integer}]
              ;; Denormalize by string_agg in order to avoid having to deal with complicated left join
              [:dash_name_str   {:display_name "Dashboards it's in", :base_type :type/Text}]
              [:user_id         {:display_name "Created By ID",      :base_type :type/Integer :remapped_to   :user_name}]
              [:user_name       {:display_name "Created By",         :base_type :type/Text    :remapped_from :user_id}]
              [:updated_at      {:display_name "Updated At",         :base_type :type/DateTime}]]
   :results (common/reducible-query
              {:with      [cards/query-runs
                           cards/latest-qe
                           cards/dashboards-ids]
               :select    [[:card.id :card_id]
                           [:card.name :card_name]
                           [:latest_qe.error :error_str]
                           :collection_id
                           [[:coalesce :coll.name "Our Analytics"] :collection_name]
                           :card.database_id
                           [:db.name :database_name]
                           [:t.schema :schema_name]
                           :card.table_id
                           [:t.name :table_name]
                           [:latest_qe.started_at :last_run_at]
                           [:query_runs.count :total_runs]
                           [:dash_card.name_str :dash_name_str]
                           [:card.creator_id :user_id]
                           [(common/user-full-name :u) :user_name]
                           [:card.updated_at :updated_at]]
               :from      [[:report_card :card]]
               :left-join [[:collection :coll]                [:= :card.collection_id :coll.id]
                           [:metabase_database :db]           [:= :card.database_id :db.id]
                           [:metabase_table :t]               [:= :card.table_id :t.id]
                           [:core_user :u]                    [:= :card.creator_id :u.id]
                           :latest_qe                         [:= :card.id :latest_qe.card_id]
                           :query_runs                        [:= :card.id :query_runs.card_id]
                           :dash_card                         [:= :card.id :dash_card.card_id]]
               :where     [:= :card.id card-id]})})

;; Details about a specific query (currently just average execution time).
(s/defmethod audit.i/internal-query ::details
  [_ query-hash :- su/NonBlankString]
  {:metadata [[:query                  {:display_name "Query",                :base_type :type/Dictionary}]
              [:average_execution_time {:display_name "Avg. Exec. Time (ms)", :base_type :type/Number}]]
   :results  (common/reducible-query
               {:select [:query
                         :average_execution_time]
                :from   [:query]
                :where  [:= :query_hash (codec/base64-decode query-hash)]
                :limit  1})
   :xform (map #(update (vec %) 0 json/parse-string))})
