(ns metabase-enterprise.audit-app.pages.queries
  (:require
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase-enterprise.audit-app.pages.common :as common]
   [metabase-enterprise.audit-app.pages.common.cards :as cards]
   [metabase.audit :as audit]
   [metabase.db :as mdb]))

;; List of all failing questions
(defmethod audit.i/internal-query ::bad-table
  ([_]
   (audit.i/internal-query ::bad-table nil nil nil nil nil))
  ([_
    error-filter
    db-filter
    collection-filter
    sort-column
    sort-direction]
   {:metadata [[:card_id         {:display_name "Card ID",            :base_type :type/Integer :remapped_to   :card_name}]
               [:card_name       {:display_name "Question",           :base_type :type/Text    :remapped_from :card_id}]
               [:error_substr    {:display_name "Error",              :base_type :type/Text    :code          true}]
               [:collection_id   {:display_name "Collection ID",      :base_type :type/Integer :remapped_to   :collection_name}]
               [:collection_name {:display_name "Collection",         :base_type :type/Text    :remapped_from :collection_id}]
               [:database_id     {:display_name "Database ID",        :base_type :type/Integer :remapped_to   :database_name}]
               [:database_name   {:display_name "Database",           :base_type :type/Text    :remapped_from :database_id}]
               [:schema_name     {:display_name "Schema",             :base_type :type/Text}]
               [:table_id        {:display_name "Table ID",           :base_type :type/Integer :remapped_to   :table_name}]
               [:table_name      {:display_name "Table",              :base_type :type/Text    :remapped_from :table_id}]
               [:last_run_at     {:display_name "Last run at",        :base_type :type/DateTime}]
               [:total_runs      {:display_name "Total runs",         :base_type :type/Integer}]
               ;; if it appears a billion times each in 2 dashboards, that's 2 billion appearances
               [:num_dashboards  {:display_name "Dashboards it's in", :base_type :type/Integer}]
               [:user_id         {:display_name "Created By ID",      :base_type :type/Integer :remapped_to   :user_name}]
               [:user_name       {:display_name "Created By",         :base_type :type/Text    :remapped_from :user_id}]
               [:updated_at      {:display_name "Updated At",         :base_type :type/DateTime}]]
    :results (common/reducible-query
              (let [coll-name    [:coalesce :coll.name "Our Analytics"]
                    error-substr [:concat
                                  [:substring
                                   :latest_qe.error
                                   [:inline (if (= (mdb/db-type) :mysql) 1 0)]
                                   [:inline 60]]
                                  "..."]
                    dash-count   [:coalesce :dash_card.count [:inline 0]]]
                (->
                 {:with      [cards/query-runs
                              cards/latest-qe
                              cards/dashboards-count]
                  :select    [[:card.id :card_id]
                              [:card.name :card_name]
                              [error-substr :error_substr]
                              :collection_id
                              [coll-name :collection_name]
                              :card.database_id
                              [:db.name :database_name]
                              [:t.schema :schema_name]
                              :card.table_id
                              [:t.name :table_name]
                              [:latest_qe.started_at :last_run_at]
                              [:query_runs.count :total_runs]
                              [dash-count :num_dashboards]
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
                  :where     [:and
                              [:= :card.archived false]
                              [:<> :latest_qe.error nil]
                              [:not= :card.database_id audit/audit-db-id]]}
                 (common/add-search-clause error-filter :latest_qe.error)
                 (common/add-search-clause db-filter :db.name)
                 (common/add-search-clause collection-filter coll-name)
                 (common/add-sort-clause
                  (or sort-column "card.name")
                  (or sort-direction "asc")))))}))
