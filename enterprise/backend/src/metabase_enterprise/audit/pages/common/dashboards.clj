(ns metabase-enterprise.audit.pages.common.dashboards
  (:require [honeysql.core :as hsql]
            [honeysql.helpers :as h]
            [metabase-enterprise.audit.pages.common :as common]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.urls :as urls]))

(defn table
  "Dashboard table!"
  [query-string & [where-clause]]
  {:metadata [[:dashboard_id              {:display_name "Dashboard ID",         :base_type :type/Integer, :remapped_to :title}]
              [:title                     {:display_name "Title",                :base_type :type/Title,   :remapped_from :dashboard_id}]
              [:saved_by_id               {:display_name "Saved by User ID",     :base_type :type/Text,    :remapped_to :saved_by}]
              [:saved_by                  {:display_name "Saved by",             :base_type :type/Text,    :remapped_from :saved_by_id}]
              [:saved_on                  {:display_name "Saved on",             :base_type :type/DateTime}]
              [:last_edited_on            {:display_name "Last edited on",       :base_type :type/DateTime}]
              [:cards                     {:display_name "Cards",                :base_type :type/Integer}]
              [:public_link               {:display_name "Public Link",          :base_type :type/URL}]
              [:average_execution_time_ms {:display_name "Avg. exec. time (ms)", :base_type :type/Decimal}]
              [:total_views               {:display_name "Total views",          :base_type :type/Integer}]]
   :results  (common/reducible-query
               (->
                {:with      [[:card_count {:select   [:dashboard_id
                                                      [:%count.* :card_count]]
                                           :from     [:report_dashboardcard]
                                           :group-by [:dashboard_id]}]
                             [:card_avg_execution_time {:select   [:card_id
                                                                   [:%avg.running_time :avg_running_time]]
                                                        :from     [:query_execution]
                                                        :where    [:not= :card_id nil]
                                                        :group-by [:card_id]}]
                             [:avg_execution_time {:select    [:dc.dashboard_id
                                                               [:%avg.cxt.avg_running_time :avg_running_time]]
                                                   :from      [[:report_dashboardcard :dc]]
                                                   :left-join [[:card_avg_execution_time :cxt] [:= :dc.card_id :cxt.card_id]]
                                                   :group-by  [:dc.dashboard_id]}]
                             [:views {:select   [[:model_id :dashboard_id]
                                                 [:%count.* :view_count]]
                                      :from     [:view_log]
                                      :where    [:= :model (hx/literal "dashboard")]
                                      :group-by [:model_id]}]]
                 :select    [[:d.id :dashboard_id]
                             [:d.name :title]
                             [:u.id :saved_by_id]
                             [(common/user-full-name :u) :saved_by]
                             [:d.created_at :saved_on]
                             [:d.updated_at :last_edited_on]
                             [:cc.card_count :cards]
                             [(hsql/call :case
                                [:not= :d.public_uuid nil]
                                (hx/concat (urls/public-dashboard-prefix) :d.public_uuid))
                              :public_link]
                             [:axt.avg_running_time :average_execution_time_ms]
                             [:v.view_count :total_views]]
                 :from      [[:report_dashboard :d]]
                 :left-join [[:core_user :u]            [:= :d.creator_id :u.id]
                             [:card_count :cc]          [:= :d.id :cc.dashboard_id]
                             [:avg_execution_time :axt] [:= :d.id :axt.dashboard_id]
                             [:views :v]                [:= :d.id :v.dashboard_id]]
                 :order-by  [[:%lower.d.name :asc]
                             [:dashboard_id :asc]]}
                (common/add-search-clause query-string :d.name)
                (h/merge-where where-clause)))})
