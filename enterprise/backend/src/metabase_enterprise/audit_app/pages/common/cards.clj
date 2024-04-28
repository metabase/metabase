(ns metabase-enterprise.audit-app.pages.common.cards)

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

(def dashboards-count
  "HoneySQL for a CTE to enumerate the dashboards for a Card."
  [:dash_card {:select [:card_id [:%count.* :count]]
               :from [:report_dashboardcard]
               :group-by [:card_id]}])
