(ns metabase-enterprise.audit-app.pages.common.cards
  (:require
   [metabase-enterprise.audit-app.pages.common :as common]
   [metabase.db.connection :as mdb.connection]
   [metabase.util.honey-sql-2 :as h2x]))

(def avg-exec-time
  "HoneySQL for a CTE to include the average execution time for each Card."
  [:avg_exec_time {:select   [:card_id
                              [:%avg.running_time :avg_running_time_ms]]
                   :from     [:query_execution]
                   :group-by [:card_id]}])

(def avg-exec-time-45
  "HoneySQL for a CTE to include the average execution time for each Card for 45 days."
  [:avg_exec_time_45 (-> {:select   [:card_id
                                     [:%avg.running_time :avg_running_time_ms]]
                          :from     [:query_execution]
                          :group-by [:card_id]}
                         (common/add-45-days-clause :started_at))])

(def total-exec-time-45
  "HoneySQL for a CTE to include the total execution time for each Card for 45 days."
  [:total_runtime_45 (-> {:select   [:card_id
                                     [:%sum.running_time :total_running_time_ms]]
                          :from     [:query_execution]
                          :group-by [:card_id]}
                         (common/add-45-days-clause :started_at))])

(def latest-qe
  "HoneySQL for a CTE to get latest QueryExecution for a Card."
  [:latest_qe {:select   [:query_execution.card_id :error :query_execution.started_at]
               :from     [:query_execution]
               :join     [[{:select [:card_id [:%max.started_at :started_at]]
                            :from [:query_execution]
                            :group-by [:card_id]} :inner_qe]
                          [:= :query_execution.started_at :inner_qe.started_at]]}])

(def query-runs
  "HoneySQL for a CTE to include the total number of queries for each Card forever."
  [:query_runs {:select   [:card_id
                           [:%count.* :count]]
                :from     [:query_execution]
                :group-by [:card_id]}])

(def query-runs-45
  "HoneySQL for a CTE to include the total number of queries for each Card for 45 days."
  [:query_runs (-> {:select   [:card_id
                               [:%count.* :count]]
                    :from     [:query_execution]
                    :group-by [:card_id]}
                   (common/add-45-days-clause :started_at))])

(def dashboards-count
  "HoneySQL for a CTE to enumerate the dashboards for a Card."
  [:dash_card {:select [:card_id [:%count.* :count]]
               :from [:report_dashboardcard]
               :group-by [:card_id]}])

(def dashboards-ids
  "HoneySQL for a CTE to enumerate the dashboards for a Card. We get the actual ID's"
  [:dash_card {:select [:card_id [(common/group-concat (h2x/cast
                                                        (if (= (mdb.connection/db-type) :mysql) :char :text)
                                                        :report_dashboard.name)
                                                       "|")
                                  :name_str]]
               :from [:report_dashboardcard]
               :join [:report_dashboard [:= :report_dashboardcard.dashboard_id :report_dashboard.id]]
               :group-by [:card_id]}])

(def views
  "HoneySQL for a CTE to include the total view count for each Card."
  [:card_views {:select   [[:model_id :card_id]
                           [:%count.* :count]]
                :from     [:view_log]
                :where    [:= :model (h2x/literal "card")]
                :group-by [:model_id]}])
