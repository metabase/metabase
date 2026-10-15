(ns metabase-enterprise.audit-app.pages.common.cards)

(def latest-qe
  "HoneySQL for a CTE to get latest QueryExecution for a Card. Exactly one row per Card."
  ;; A Card can have several executions sharing its max started_at, so we need to rank them first.
  [:latest_qe ^:allow-subquery
   {:select [:card_id :error :started_at]
    :from   [[^:allow-subquery
              {:select [:query_execution.card_id
                        :query_execution.error
                        :query_execution.started_at
                        [[:over [[:row_number]
                                 ^:allow-subquery
                                 {:partition-by [:query_execution.card_id]
                                  :order-by     [[:query_execution.id :desc]]}
                                 :rn]]]]
               :from   [:query_execution]
               ;; Join on BOTH card_id and started_at, because some cards share the same timestamp.
               :join   [[^:allow-subquery
                         {:select   [:card_id [:%max.started_at :started_at]]
                          :from     [:query_execution]
                          :group-by [:card_id]} :inner_qe]
                        [:and
                         [:= :query_execution.card_id :inner_qe.card_id]
                         [:= :query_execution.started_at :inner_qe.started_at]]]}
              :ranked_qe]]
    :where  [:= :rn [:inline 1]]}])

(def query-runs
  "HoneySQL for a CTE to include the total number of queries for each Card forever."
  [:query_runs ^:allow-subquery {:select   [:card_id
                                            [:%count.* :count]]
                                 :from     [:query_execution]
                                 :group-by [:card_id]}])

(def dashboards-count
  "HoneySQL for a CTE to enumerate the dashboards for a Card."
  [:dash_card ^:allow-subquery {:select [:card_id [:%count.* :count]]
                                :from [:report_dashboardcard]
                                :group-by [:card_id]}])
