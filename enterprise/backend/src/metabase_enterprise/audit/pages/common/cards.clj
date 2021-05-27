(ns metabase-enterprise.audit.pages.common.cards
  (:require [metabase.util.honeysql-extensions :as hx]))

(def avg-exec-time
  "HoneySQL for a CTE to include the average execution time for each Card."
  [:avg_exec_time {:select   [:card_id
                              [:%avg.running_time :avg_running_time_ms]]
                   :from     [:query_execution]
                   :group-by [:card_id]}])

(def total-exec-time
  "HoneySQL for a CTE to include the total execution time for each Card."
  [:total_exec_time {:select   [:card_id
                                [:%sum.running_time :total_running_time_ms]]
                     :from     [:query_execution]
                     :group-by [:card_id]}])

(def query-runs
  "HoneySQL for a CTE to include the total number of queries for each Card."
  [:query_runs {:select   [:card_id
                           [:%count.* :count]]
                :from     [:query_execution]
                :group-by [:card_id]}])

(def views
  "HoneySQL for a CTE to include the total view count for each Card."
  [:card_views {:select   [[:model_id :card_id]
                           [:%count.* :count]]
                :from     [:view_log]
                :where    [:= :model (hx/literal "card")]
                :group-by [:model_id]}])
