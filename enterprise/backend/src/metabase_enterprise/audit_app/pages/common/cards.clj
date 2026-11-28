(ns metabase-enterprise.audit-app.pages.common.cards
  (:require
   [metabase.queries.core :as queries]
   [toucan2.core :as t2]))

(defn latest-qe
  "HoneySQL for a CTE to get latest QueryExecution for a Card. Exactly one row per Card. Runs in
  `referenced-run-contexts` don't count."
  []
  ;; A Card can have several executions sharing its max started_at, so we need to rank them first.
  [:latest_qe ^:allow-subquery
   {:select [:card_id :error :started_at]
    :from   [[^:allow-subquery
              {:select [:qe.card_id
                        :qe.error
                        :qe.started_at
                        [[:over [[:row_number]
                                 ^:allow-subquery
                                 {:partition-by [:qe.card_id]
                                  :order-by     [[:qe.id :desc]]}]]
                         :rn]]
               :from   [[(t2/table-name :model/QueryExecution) :qe]]
               ;; Join on BOTH card_id and started_at, because some cards share the same timestamp.
               :join   [[^:allow-subquery
                         {:select   [:card_id [[:max :started_at] :started_at]]
                          :from     [(t2/table-name :model/QueryExecution)]
                          :where    (queries/not-referenced-run :context)
                          :group-by [:card_id]} :inner_qe]
                        [:and
                         [:= :qe.card_id :inner_qe.card_id]
                         [:= :qe.started_at :inner_qe.started_at]]]
               :where  (queries/not-referenced-run :qe.context)}
              :ranked_qe]]
    :where  [:= :rn [:inline 1]]}])

(defn query-runs
  "HoneySQL for a CTE to include the total number of queries for each Card forever. Runs in `referenced-run-contexts`
  don't count."
  []
  [:query_runs ^:allow-subquery {:select   [:card_id
                                            [[:count :*] :count]]
                                 :from     [(t2/table-name :model/QueryExecution)]
                                 :where    (queries/not-referenced-run :context)
                                 :group-by [:card_id]}])

(defn dashboards-count
  "HoneySQL for a CTE to enumerate the dashboards for a Card."
  []
  [:dash_card ^:allow-subquery {:select [:card_id [[:count :*] :count]]
                                :from [(t2/table-name :model/DashboardCard)]
                                :group-by [:card_id]}])
