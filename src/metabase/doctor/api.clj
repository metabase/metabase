(ns metabase.doctor.api
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-query-execution-stats
  "Get query execution statistics for the last N days"
  [days]
  {:total-queries (t2/count :model/QueryExecution
                            {:where [:>= :started_at (t/minus (t/instant) (t/days days))]})
   :error-queries (t2/select :model/QueryExecution {:select [:query_execution.id :query_execution.database_id :query_execution.running_time :error :context :query_execution.card_id :report_card.name]
                                                    :from [:query_execution]
                                                    :left-join [[:report_card] [:= :query_execution.card_id :report_card.id]]
                                                    :where [:and
                                                            [:>= :started_at (t/minus (t/instant) (t/days days))]
                                                            [:not= :context "ad-hoc"]
                                                            [:not= :error nil]]
                                                    :limit 20
                                                    :order-by [[:query_execution.started_at :desc]]})
   :slow-queries  (t2/select :model/QueryExecution {:select [:query_execution.id :query_execution.database_id :query_execution.running_time :error :context :query_execution.card_id :report_card.name]
                                                    :from [:query_execution]
                                                    :left-join [[:report_card] [:= :query_execution.card_id :report_card.id]]
                                                    :where [:and
                                                            [:>= :started_at (t/minus (t/instant) (t/days days))]
                                                            [:not= :context "ad-hoc"]
                                                            [:> :running_time 60000]]
                                                    :limit 20
                                                    :order-by [[:running_time :desc]]})
   :queries-by-context (t2/select :model/QueryExecution {:select [:context [:%count.* :count]]
                                                         :from [:query_execution]
                                                         :where [:>= :started_at (t/minus (t/instant) (t/days days))]
                                                         :group-by [:context]})})

(defn- get-task-history-stats
  "Get task execution statistics"
  [days]
  {:failed-tasks (t2/select :model/TaskHistory {:select [:task :db_id [:%count.* :count]]
                                                :from [:task_history]
                                                :where [:and
                                                        [:>= :started_at (t/minus (t/instant) (t/days days))]
                                                        [:= :status "failed"]]
                                                :group-by [:task :db_id]
                                                :order-by [[:%count.* :desc]]
                                                :limit 50})
   :long-running-tasks (t2/select :model/TaskHistory {:select [:task :duration :db_id]
                                                      :from [:task_history]
                                                      :where [:and
                                                              [:>= :started_at (t/minus (t/instant) (t/days days))]
                                                              [:> :duration 300000]]
                                                      :order-by [[:duration :desc]]
                                                      :limit 20})})

(defn- _get-pgstats-stats
  "set a lock with `begin; lock metabase_database in exclusive mode`"
  [& _args]
  {:locks
   (t2/query
    {:select     [:pg_stat_activity.pid :pg_class.relname :pg_locks.transactionid :pg_locks.granted]
     :from       [[:pg_stat_activity]
                  [:pg_locks]]
     :left-join [:pg_class [:= :pg_locks.relation :pg_class.oid]]
     :where [:and
             [:not= :pg_stat_activity.query "<insufficient privilege>"]
             [:= :pg_locks.pid :pg_stat_activity.pid]
             [:= :pg_locks.mode "ExclusiveLock"]
             [:not= :pg_stat_activity.pid [:call :pg_backend_pid]]]
     :order-by [:query_start]})

   :long-running
   (t2/query
    {:select [:pid
              [[:- [:now] :pg_stat_activity.xact_start] :duration]
              :query
              :state]
     :from [:pg_stat_activity]
     :where [:> [[:- [:now] :pg_stat_activity.xact_start]]
             [:raw "interval '5 minutes'"]]
     :order-by [[2 :desc]]})})

;; (defn- get-database-stats
;;   "Get database metadata statistics"
;;   []
;;   (let [db-field-counts (t2/select :model/Database {:select [:d.id :d.name :d.engine [:%count.f.id :field_count]]
;;                                     :from [[:metabase_database :d]]
;;                                     :left-join [[:metabase_table :t] [:= :d.id :t.db_id]
;;                                                 [:metabase_field :f] [:= :t.id :f.table_id]]
;;                                     :group-by [:d.id :d.name :d.engine]
;;                                     :order-by [[:%count.f.id :desc]]})]
;;     {:databases db-field-counts
;;      :high-field-databases (filter #(> (:field_count %) 100000) db-field-counts)}))

;; (defn- get-pulse-stats
;;   "Get pulse/subscription statistics"
;;   []
;;   {:active-pulses (t2/count :model/Pulse {:where [:= :archived false]})
;;    :hourly-pulses (t2/select :model/Pulse {:select [:p.id :p.name [:%count.pc.id :card_count]]
;;                               :from [[:pulse :p]]
;;                               :left-join [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
;;                               :where [:and
;;                                       [:= :p.archived false]
;;                                       [:like :p.schedule_type "hourly"]]
;;                               :group-by [:p.id :p.name]})
;;    :large-result-pulses (t2/select :model/Pulse {:select [:p.id :p.name :qe.result_rows]
;;                                     :from [[:pulse :p]]
;;                                     :join [[:pulse_card :pc] [:= :p.id :pc.pulse_id]
;;                                            [:query_execution :qe] [:= :pc.card_id :qe.card_id]]
;;                                     :where [:and
;;                                             [:= :p.archived false]
;;                                             [:> :qe.result_rows 100000]]
;;                                     :limit 20
;;                                     :order-by [[:qe.result_rows :desc]]})})

;; (defn- get-cache-settings
;;   "Get current cache configuration"
;;   []
;;   {:query-caching-max-kb (setting/get :query-caching-max-kb)
;;    :query-caching-min-ttl (setting/get :query-caching-min-ttl)
;;    :query-caching-ttl-ratio (setting/get :query-caching-ttl-ratio)})

(defn- collect-health-metrics
  "Collect all health metrics for analysis"
  [days]
  {:timestamp (t/instant)
   :period-days days
   :query-stats (get-query-execution-stats days)
   :task-stats (get-task-history-stats days)
  ;;  :pg-stats   (get-pgstats-stats)
   })
  ;;  :database-stats (get-database-stats)
  ;;  :pulse-stats (get-pulse-stats)
  ;;  :cache-settings (get-cache-settings)

(def ^:private analysis-prompt
  "You are an expert Metabase health diagnostic specialist. Analyze this comprehensive health data and generate a detailed diagnostic report.

CRITICAL PATTERNS TO IDENTIFY:

1. **OOM (Out of Memory) Risk Indicators**
   - Notification-send task crashes (especially hourly patterns)
   - Queries returning >100K rows (especially >1M rows)
   - Hourly pulses with large card counts or result sets
   - MongoDB databases with >100K fields causing fingerprinting crashes
   - Concurrent pulse execution at the same time
   - Sync/fingerprint tasks failing repeatedly on specific databases

2. **Performance Degradation Patterns**
   - Queries taking >10 seconds (identify patterns by context)
   - Dashboard queries with high error rates
   - Cache configuration issues (especially query-caching-max-kb < 200)
   - Failed sync operations blocking metadata updates
   - Large field counts (>100K) in databases slowing operations

3. **Error Patterns**
   - Join alias errors ('Column with source :source/implicitly-joinable')
   - Assert failures indicating null value issues
   - Column not found errors suggesting schema changes
   - Recurring task failures (fingerprint-fields, analyze, sync-fks)
   - Error spikes at specific hours indicating scheduled job issues

4. **Resource Consumption Issues**
   - Peak hourly query volumes exceeding normal patterns
   - Large result sets being loaded into memory
   - Multiple databases with excessive field counts
   - Concurrent heavy operations (syncs + pulses + queries)

ANALYSIS APPROACH:

1. First, identify any CRITICAL issues that could cause immediate crashes or OOMs
2. Then identify HIGH priority performance issues affecting user experience
3. Finally, note optimization opportunities for long-term stability

REPORT STRUCTURE:

# 🏥 Metabase Instance Health Diagnostic Report

## 📊 Executive Summary
- Overall health score (Critical/Poor/Fair/Good/Excellent)
- Top 3 critical issues requiring immediate action
- Risk assessment for OOM/crashes

## 🔴 Critical Issues (Immediate Action Required)
For each critical issue:
- **Issue**: Clear description
- **Evidence**: Specific metrics/numbers from the data
- **Impact**: What will happen if not fixed
- **Root Cause**: Why this is happening
- **Fix**: Specific actionable steps with exact settings/queries to change

## 🟡 High Priority Issues (Fix Within 7 Days)
Similar format as critical issues

## 🟢 Medium Priority Optimizations (Fix Within 30 Days)
Brief list with recommendations

## 📈 Performance Metrics Summary
- Query performance stats
- Task execution health
- Database sync status
- Error rates and patterns

## 🎯 Specific Recommendations
Numbered list of actions in priority order with:
1. **Action**: What to do
2. **How**: Exact steps or SQL/settings changes
3. **Expected Impact**: What will improve

## 📊 Detailed Metrics Tables
Include relevant data tables for:
- Slowest queries
- Failed tasks
- Large databases
- Problematic pulses

Be extremely specific about:
- Which databases have issues (use DB IDs and names)
- Which pulses/cards are problematic (use IDs)
- Exact error messages and their frequencies
- Time patterns (e.g., 'crashes every hour at XX:00')
- Memory estimates based on row counts and field counts

Respect this style:
- Use tables, bullet points, and formatting to make the report scannable and actionable.
- Include severity indicators: 🔴 Critical, 🟡 Warning, 🟢 Good, ⚠️ Caution")

(defn- call-openai
  "Call OpenAI GPT API"
  [prompt data]
  (let [api-key (env/env :openai-api-key)
        model "gpt-4-turbo-preview"]
    (when-not api-key
      (throw (ex-info "OpenAI API key not configured" {})))
    (let [response (http/post "https://api.openai.com/v1/chat/completions"
                              {:headers {"Authorization" (str "Bearer " api-key)
                                         "Content-Type" "application/json"}
                               :body (json/encode
                                      {:model model
                                       :messages [{:role "system"
                                                   :content "You are a Metabase health diagnostic expert."}
                                                  {:role "user"
                                                   :content (str prompt "\n\n"
                                                                 "Health data:\n```json\n"
                                                                 (json/encode data {:pretty true})
                                                                 "\n```")}]})
                               :as :json})]
      (-> response :body :choices first :message :content))))

(def ^:private openai-memo
  (memoize/ttl call-openai :ttl/threshold (u/minutes->ms 30)))

(def ^:private collect-health-metrics-memo
  (memoize/ttl collect-health-metrics :ttl/threshold (u/minutes->ms 30)))

(api.macros/defendpoint :get "/"
  "Doctor endpoint that calls OpenAI with 'Hello' prompt"
  []
  {:status 200
   :body   {:reportMarkdown (openai-memo analysis-prompt (collect-health-metrics-memo 1))}})

(api.macros/defendpoint :get "/metrics"
  "Clear memoized data and return success status"
  []
  (memoize/memo-clear! openai-memo)
  (memoize/memo-clear! collect-health-metrics-memo)
  {:status 200
   :body   (collect-health-metrics-memo 1)})
