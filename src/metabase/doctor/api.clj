(ns metabase.doctor.api
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase.api.macros :as api.macros]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-query-execution-stats
  "Get detailed query execution statistics for the last N days"
  [days]
  (let [since (t/minus (t/instant) (t/days days))]
    {:total-queries (t2/count :model/QueryExecution
                              {:where [:>= :started_at since]})

     :error-queries (t2/select :model/QueryExecution
                                {:select [:query_execution.id
                                          :query_execution.database_id
                                          [:metabase_database.name :database_name]
                                          :query_execution.running_time
                                          :error :context
                                          :query_execution.card_id
                                          :report_card.name]
                                 :from [:query_execution]
                                 :left-join [[:report_card] [:= :query_execution.card_id :report_card.id]
                                             [:metabase_database] [:= :query_execution.database_id :metabase_database.id]]
                                 :where [:and
                                         [:>= :started_at since]
                                         [:not= :error nil]]
                                 :limit 100
                                 :order-by [[:query_execution.started_at :desc]]})

     ;; Queries with >10 second runtime
     :slow-queries (t2/select :model/QueryExecution
                               {:select [:query_execution.id
                                         :query_execution.database_id
                                         [:metabase_database.name :database_name]
                                         :query_execution.card_id
                                         :report_card.name
                                         :running_time :error :context :result_rows]
                                :from [:query_execution]
                                :left-join [[:report_card] [:= :query_execution.card_id :report_card.id]
                                            [:metabase_database] [:= :query_execution.database_id :metabase_database.id]]
                                :where [:and
                                        [:>= :started_at since]
                                        [:> :running_time 10000]]
                                :limit 100
                                :order-by [[:running_time :desc]]})

     ;; Queries with extremely large result sets
     :large-result-queries (t2/select :model/QueryExecution
                                       {:select [:query_execution.id
                                                 :query_execution.card_id
                                                 :report_card.name
                                                 :query_execution.database_id
                                                 [:metabase_database.name :database_name]
                                                 :result_rows :running_time :context]
                                        :from [:query_execution]
                                        :left-join [[:report_card] [:= :query_execution.card_id :report_card.id]
                                                    [:metabase_database] [:= :query_execution.database_id :metabase_database.id]]
                                        :where [:and
                                                [:>= :started_at since]
                                                [:> :result_rows 100000]]
                                        :limit 50
                                        :order-by [[:result_rows :desc]]})

     ;; Error patterns
     :error-patterns (t2/select :model/QueryExecution
                                 {:select [:error [[:count :*] :count]]
                                  :where [:and
                                          [:>= :started_at since]
                                          [:not= :error nil]]
                                  :group-by [:error]
                                  :order-by [[:count :desc]]
                                  :limit 20})

     ;; Query distribution by context
     :queries-by-context (t2/select :model/QueryExecution
                                     {:select [:context
                                               [[:count :*] :total]
                                               [[:sum [:case [:not= :error nil] [:inline 1] :else [:inline 0]]] :errors]
                                               [[:avg :running_time] :avg_runtime]
                                               [[:max :running_time] :max_runtime]]
                                      :where [:>= :started_at since]
                                      :group-by [:context]})

     ;; Hourly query volume
     :hourly-volume (t2/select :model/QueryExecution
                                {:select [[[:date_trunc [:inline "hour"] :started_at] :hour]
                                          [:%count.* :queries]
                                          [[:sum [:case [:not= :error nil] [:inline 1] :else [:inline 0]]] :errors]
                                          [:%max.result_rows :max_rows]]
                                 :where [:>= :started_at (t/minus (t/instant) (t/days 2))]
                                 :group-by [[:date_trunc [:inline "hour"] :started_at]]
                                 :order-by [[:hour :desc]]
                                 :limit 48})}))

(defn- get-task-history-stats
  "Get comprehensive task execution statistics"
  [days]
  (let [since (t/minus (t/instant) (t/days days))]
    {:failed-tasks (t2/select :model/TaskHistory
                               {:select [:task :db_id [:metabase_database.name :db_name] [:%count.* :count]]
                                :from [:task_history]
                                :left-join [[:metabase_database] [:= :task_history.db_id :metabase_database.id]]
                                :where [:and
                                        [:>= :started_at since]
                                        [:or
                                         [:= :ended_at nil]
                                         [:= :status "failed"]]]
                                :group-by [:task :db_id :db_name]
                                :order-by [[:%count.* :desc]]
                                :limit 50})

     ;; Tasks that consistently fail
     :recurring-failures (->> (t2/select :model/TaskHistory
                                         {:select [:task :db_id
                                                   [[:count :*] :total_runs]
                                                   [[:sum [:case [:or [:= :ended_at nil] [:= :status "failed"]] [:inline 1] :else [:inline 0]]] :failures]]
                                          :where [:>= :started_at since]
                                          :group-by [:task :db_id]})
                              (filter #(> (:failures %) 5))
                              (sort-by :failures >)
                              vec)

     :long-running-tasks (t2/select :model/TaskHistory
                                     {:select [:task :duration :db_id [:metabase_database.name :db_name]]
                                      :from [:task_history]
                                      :left-join [[:metabase_database] [:= :task_history.db_id :metabase_database.id]]
                                      :where [:and
                                              [:>= :started_at since]
                                              [:> :duration 300000]]
                                      :order-by [[:duration :desc]]
                                      :limit 20})

     ;; Sync performance by database
     :sync-performance (t2/select :model/TaskHistory
                                   {:select [:db_id
                                             :task
                                             [:%avg.duration :avg_duration]
                                             [:%max.duration :max_duration]
                                             [:%count.* :executions]]
                                    :where [:and
                                            [:>= :started_at since]
                                            [:in :task ["sync" "sync-fields" "fingerprint-fields" "analyze"]]]
                                    :group-by [:db_id :task]
                                    :order-by [[:db_id :asc] [:task :asc]]})}))

(defn- get-pgstats-stats
  "Get PostgreSQL specific statistics - set a lock with `begin; lock metabase_database in exclusive mode`"
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

(defn- get-database-stats
  "Get comprehensive database metadata statistics"
  []
  (let [db-field-counts (t2/query {:select [:d.id :d.name :d.engine
                                              [[:count [:distinct :t.id]] :table_count]
                                              [[:count :f.id] :field_count]]
                                     :from [[:metabase_database :d]]
                                     :left-join [[:metabase_table :t] [:= :d.id :t.db_id]
                                                 [:metabase_field :f] [:= :t.id :f.table_id]]
                                     :where [:not= :d.id 13371337] ; Exclude internal DB
                                     :group-by [:d.id :d.name :d.engine]
                                     :order-by [[:field_count :desc]]})]
    {:databases db-field-counts
     :high-field-databases (filter #(> (:field_count %) 100000) db-field-counts)
     :mongodb-databases (filter #(= (:engine %) "mongo") db-field-counts)
     :total-field-count (reduce + 0 (map :field_count db-field-counts))
     :fingerprinting-status (->> (t2/query {:select [:f.table_id
                                                     [[:count :*] :total_fields]
                                                     [[:sum [:case [:not= :f.fingerprint nil] [:inline 1] :else [:inline 0]]] :fingerprinted]
                                                     [[:sum [:case [:not= :f.last_analyzed nil] [:inline 1] :else [:inline 0]]] :analyzed]]
                                            :from [[:metabase_field :f]]
                                            :join [[:metabase_table :t] [:= :f.table_id :t.id]]
                                            :where [:and
                                                    [:= :t.active true]
                                                    [:not= :t.db_id 13371337]]
                                            :group-by [:f.table_id]})
                                 (filter #(> (:total_fields %) 1000))
                                 (sort-by :total_fields >)
                                 (take 20)
                                 vec)}))

(defn- get-pulse-stats
  "Get comprehensive pulse/subscription statistics"
  []
  {:active-pulses (-> (t2/query {:select [[[:count :*] :count]]
                                 :from [[:pulse]]
                                 :where [:= :archived false]})
                      first
                      :count
                      (or 0))

   ;; Hourly pulses - the most dangerous for OOMs
   :hourly-pulses (t2/query {:select [:p.id :p.name
                                      [[:count [:distinct :pcard.id]] :card_count]]
                             :from [[:pulse :p]]
                             :join [[:pulse_channel :pchan] [:= :p.id :pchan.pulse_id]]
                             :left-join [[:pulse_card :pcard] [:= :p.id :pcard.pulse_id]]
                             :where [:and
                                     [:= :p.archived false]
                                     [:or
                                      [:like :pchan.schedule_type "hourly"]
                                      [:like [:cast :pchan.schedule_hour :text] "%*%"]]]
                             :group-by [:p.id :p.name]
                             :order-by [[:card_count :desc]]})

   ;; Pulses with many cards
   :large-pulses (->> (t2/query {:select [:p.id :p.name
                                          [[:count :pc.id] :card_count]]
                                 :from [[:pulse :p]]
                                 :left-join [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
                                 :where [:= :p.archived false]
                                 :group-by [:p.id :p.name]})
                      (filter #(> (:card_count %) 10))
                      (sort-by :card_count >)
                      vec)

   ;; Dashboard subscriptions (counting pulses with dashboard_id)
   :dashboard-subscriptions (-> (t2/query {:select [[[:count :*] :count]]
                                            :from [[:pulse]]
                                            :where [:and
                                                    [:= :archived false]
                                                    [:not= :dashboard_id nil]]})
                                first
                                :count
                                (or 0))

   ;; Recent pulse execution errors
   :recent-pulse-errors (t2/query {:select [:task :task_details :started_at]
                                   :from [[:task_history]]
                                   :where [:and
                                           [:in :task ["send-pulse" "notification-send"]]
                                           [:= :ended_at nil]
                                           [:>= :started_at (t/minus (t/instant) (t/days 1))]]
                                   :order-by [[:started_at :desc]]
                                   :limit 20})})

(defn- get-cache-settings
  "Get current cache configuration"
  []
  {:enable-query-caching (setting/get :enable-query-caching)
   :query-caching-max-kb (setting/get :query-caching-max-kb)
   :query-caching-max-ttl (setting/get :query-caching-max-ttl)})

(defn- get-system-metrics
  "Get system-level metrics and configuration"
  []
  {:metabase-version (setting/get :version-info-last-checked)
   :total-users (-> (t2/query {:select [[[:count :*] :count]]
                               :from [[:core_user]]
                               :where [:= :is_active true]})
                    first
                    :count
                    (or 0))
   :total-dashboards (-> (t2/query {:select [[[:count :*] :count]]
                                    :from [[:report_dashboard]]
                                    :where [:= :archived false]})
                         first
                         :count
                         (or 0))
   :total-cards (-> (t2/query {:select [[[:count :*] :count]]
                               :from [[:report_card]]
                               :where [:= :archived false]})
                    first
                    :count
                    (or 0))
   :total-collections (-> (t2/query {:select [[[:count :*] :count]]
                                     :from [[:collection]]
                                     :where [:= :archived false]})
                          first
                          :count
                          (or 0))

   ;; Public and embedded content
   :public-dashboards (-> (t2/query {:select [[[:count :*] :count]]
                                     :from [[:report_dashboard]]
                                     :where [:and
                                             [:= :archived false]
                                             [:not= :public_uuid nil]]})
                          first
                          :count
                          (or 0))
   :embedded-dashboards (-> (t2/query {:select [[[:count :*] :count]]
                                       :from [[:report_dashboard]]
                                       :where [:and
                                               [:= :archived false]
                                               [:= :enable_embedding true]]})
                            first
                            :count
                            (or 0))

   ;; Recent activity
   :active-users-24h (-> (t2/query {:select [[[:count [:distinct :user_id]] :count]]
                                    :from [[:view_log]]
                                    :where [:>= :timestamp (t/minus (t/instant) (t/days 1))]})
                         first
                         :count
                         (or 0))

   :queries-last-24h (-> (t2/query {:select [[[:count :*] :count]]
                                    :from [[:query_execution]]
                                    :where [:>= :started_at (t/minus (t/instant) (t/days 1))]})
                         first
                         :count
                         (or 0))})

(defn- get-oom-indicators
  "Get metrics that commonly indicate OOM risks"
  []
  {:notification-crashes (-> (t2/query {:select [[[:count :*] :count]]
                                        :from [[:task_history]]
                                        :where [:and
                                                [:= :task "notification-send"]
                                                [:= :ended_at nil]
                                                [:>= :started_at (t/minus (t/instant) (t/days 7))]]})
                             first
                             :count
                             (or 0))

   :queries-over-1m-rows (-> (t2/query {:select [[[:count :*] :count]]
                                        :from [[:query_execution]]
                                        :where [:and
                                                [:>= :started_at (t/minus (t/instant) (t/days 7))]
                                                [:> :result_rows 1000000]]})
                             first
                             :count
                             (or 0))

   :concurrent-hourly-pulses (-> (t2/query {:select [[[:count [:distinct :p.id]] :count]]
                                            :from [[:pulse :p]]
                                            :join [[:pulse_channel :pchan] [:= :p.id :pchan.pulse_id]]
                                            :where [:and
                                                    [:= :p.archived false]
                                                    [:or
                                                     [:like :pchan.schedule_type "hourly"]
                                                     [:like [:cast :pchan.schedule_hour :text] "%*%"]]]})
                                 first
                                 :count
                                 (or 0))

   :databases-over-100k-fields (->> (t2/query {:select [:d.id
                                                         [[:count :f.id] :field_count]]
                                               :from [[:metabase_database :d]]
                                               :join [[:metabase_table :t] [:= :d.id :t.db_id]
                                                      [:metabase_field :f] [:= :t.id :f.table_id]]
                                               :group-by [:d.id]})
                                    (filter #(> (:field_count %) 100000))
                                    count)})

(defn- collect-health-metrics
  "Collect all health metrics for comprehensive analysis"
  [days]
  {:timestamp (t/instant)
   :period-days days
   :query-stats (get-query-execution-stats days)
   :task-stats (get-task-history-stats days)
   :database-stats (get-database-stats)
   :pulse-stats (get-pulse-stats)
   :cache-settings (get-cache-settings)
   :system-metrics (get-system-metrics)
   :oom-indicators (get-oom-indicators)
   :pg-stats (try
               (get-pgstats-stats)
               (catch Exception e
                 {:error "PostgreSQL stats not available or not using PostgreSQL"}))})

(def ^:private enhanced-analysis-prompt
  "You are an expert Metabase health diagnostic specialist. Analyze the provided health data and produce a clear, human-readable Markdown report that highlights problematic areas and performance issues. Focus on actionable insights from metrics and stats.

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

1. Identify CRITICAL issues that could cause immediate crashes or OOMs
2. Identify HIGH priority performance issues affecting user experience
3. Note optimization opportunities for long-term stability

REPORT STRUCTURE:

# 🏥 Metabase Instance Health Diagnostic Report

## 📊 Executive Summary
- Overall health score (Critical/Poor/Fair/Good/Excellent)
- Top 3 critical issues requiring immediate action
- Risk assessment for OOM/crashes
- Key metrics: Total queries last 24h, error rate, active users

## 🚨 Problem Areas (Tables)
IMPORTANT: Only create tables for actual problems found in the data. If no issues exist for a category, skip that table entirely or note 'No issues detected'.

### 🐌 Slowest Queries (>10s)
From `query-stats.slow-queries`:
- ONLY show if queries exist with runtime > 10000ms
- Show top 10 slowest, formatted as:
| Query/Card | Database | Runtime (s) | Rows Returned | Context |
|------------|----------|-------------|---------------|---------|
- Format runtime as seconds with 1 decimal (e.g., 45.2s)
- Include card names with links: [Card Name](/question/123)
- If no slow queries exist, show: ✅ No slow queries detected

### ❌ Failed Queries
From `query-stats.error-queries`:
- ONLY show if errors exist
- Group similar errors together, show top patterns:
| Error Pattern | Count | Example Query/Card | Database | Last Occurred |
|---------------|-------|-------------------|----------|---------------|
- For Assert failed errors, group them together
- For Column not found errors, list affected columns
- If no errors, show: ✅ No query errors in the past 7 days

### 📉 Failed Tasks
From `task-stats.failed-tasks` and `task-stats.recurring-failures`:
- ONLY show tasks that have failed >3 times or are currently stuck (ended_at = nil)
| Task Type | Database | Failure Count | Status | Action Required |
|-----------|----------|---------------|--------|-----------------|
- Mark tasks with >10 failures as 🔴 Critical
- Mark tasks with 5-10 failures as 🟡 Warning
- If no failed tasks, show: ✅ All tasks running successfully

### ⚠️ Large Result Queries
From `query-stats.large-result-queries`:
- ONLY show queries with result_rows > 100,000
| Query/Card | Database | Rows Returned | Runtime (s) | Memory Risk |
|------------|----------|---------------|-------------|-------------|
- Format row counts with commas (e.g., 1,234,567)
- Mark >500K rows as 🟡 High Risk
- Mark >1M rows as 🔴 Critical Risk
- Calculate estimated memory: rows * 1KB for rough estimate
- If no large queries, show: ✅ No concerning large result sets

### ⏰ Long-Running Tasks
From `task-stats.long-running-tasks`:
- ONLY show tasks with duration > 300000ms (5 minutes)
| Task | Database | Duration | Status | Impact |
|------|----------|----------|--------|--------|
- Format duration in human-readable format (e.g., 12m 30s or 2h 15m)
- Highlight sync/fingerprint tasks that block metadata updates
- If no long tasks, skip this section

### 🔄 Problematic Pulses/Subscriptions
From `pulse-stats`:
- ONLY show if any of these conditions are met:
  * Hourly pulses with >5 cards
  * Any pulse with >15 cards
  * Recent pulse execution errors
  * Pulses running every hour (schedule contains asterisk)
| Type | Name | Issue | Cards | Schedule | Memory Risk |
|------|------|-------|-------|----------|-------------|
- Calculate memory risk based on card count * typical result size
- Mark hourly pulses with >5 cards as 🟡 Warning
- If no problematic pulses, show: ✅ All pulses configured safely

### 🗄️ Database Health Issues
From `database-stats`:
- ONLY show databases meeting ANY of these criteria:
  * Field count > 50,000
  * MongoDB with >10,000 fields
  * Failed sync/fingerprint tasks from task-stats
  * Fingerprinting completion < 80%
| Database | Issue Type | Fields | Tables | Action Required |
|----------|------------|--------|--------|-----------------|
- Mark databases >100K fields as 🔴 Critical
- Mark MongoDB >50K fields as 🔴 Critical
- If all databases healthy, show: ✅ All databases operating normally

### 📊 Query Performance by Context
From `query-stats.queries-by-context`:
- ONLY show contexts with:
  * Error rate > 5%
  * Average runtime > 5000ms
  * Maximum runtime > 30000ms
| Context | Total Queries | Error Rate | Avg Runtime | Max Runtime | Status |
|---------|---------------|------------|-------------|-------------|--------|
- Format error rate as percentage
- Format runtimes in seconds
- Mark error rate >10% as 🔴 Critical
- If all contexts healthy, skip this section

### 📈 Hourly Query Volume Patterns
From `query-stats.hourly-volume`:
- ONLY show hours with:
  * Error rate > 10%
  * Query volume >2x average
  * Max rows > 500,000
| Hour | Queries | Errors | Error Rate | Max Rows | Alert |
|------|---------|--------|------------|----------|-------|
- Only include problematic hours
- Format hour in readable format (e.g., 2024-01-15 14:00)
- If no anomalies, skip this section

## 🔴 Critical Issues (Immediate Action Required)
For each critical issue:
- **Issue**: Clear description
- **Evidence**: Specific metrics/numbers from the data tables above
- **Impact**: What will happen if not fixed
- **Root Cause**: Why this is happening
- **Fix**: Specific actionable steps with exact settings/queries to change

## 🟡 High Priority Issues (Fix Within 7 Days)
Same format as critical issues

## 🟢 Medium Priority Optimizations (Fix Within 30 Days)
Brief list with recommendations

## 🎯 Specific Recommendations
Numbered list of actions in priority order with:
1. **Action**: What to do
2. **How**: Exact steps or SQL/settings changes
3. **Expected Impact**: What will improve

PRESENTATION RULES:
- Tables should only show problematic items, not everything
- Use severity indicators: 🔴 Critical, 🟡 Warning, 🟢 Good, ⚠️ Caution
- Format runtimes in seconds with 1 decimal place
- Format large numbers with commas (e.g., 1,234,567)
- Link entities: [Card Name](/question/123), [DB Name](/admin/databases/123), [Dashboard](/dashboard/123)
- If a table would be empty (no problems), note \"✅ No issues detected\" instead of showing empty table")

(defn- call-openai
  "Call OpenAI GPT API with enhanced prompt"
  [prompt data]
  (let [api-key (env/env :openai-api-key)
        model (or (env/env :openai-model) "gpt-4o")]
    (when-not api-key
      (throw (ex-info "OpenAI API key not configured" {})))
    (let [response (http/post "https://api.openai.com/v1/chat/completions"
                              {:headers {"Authorization" (str "Bearer " api-key)
                                         "Content-Type" "application/json"}
                               :body (json/encode
                                      {:model model
                                       :messages [{:role "system"
                                                   :content "You are a Metabase health diagnostic expert. Generate a clear, human‑readable Markdown report with well‑structured tables for pulses, notifications, dashboards, and databases."}
                                                  {:role "user"
                                                   :content (str prompt "\n\n"
                                                                 "Health data:\n```json\n"
                                                                 (json/encode data {:pretty true})
                                                                 "\n```")}]
                                       :max_tokens 5000
                                       :temperature 0.5})
                               :as :json
                               :timeout 30000})]
      (-> response :body :choices first :message :content))))

;; Memoization for performance - cache results for 30 minutes
(def ^:private openai-memo
  (memoize/ttl call-openai :ttl/threshold (u/minutes->ms 30)))

(def ^:private collect-health-metrics-memo
  (memoize/ttl collect-health-metrics :ttl/threshold (u/minutes->ms 30)))

(api.macros/defendpoint :get "/"
  "Doctor endpoint that performs comprehensive health analysis"
  []
  {:status 200
   :body   {:reportMarkdown (openai-memo enhanced-analysis-prompt (collect-health-metrics-memo 7))}})

(api.macros/defendpoint :get "/metrics"
  "Get raw health metrics (also clears memoized cache)"
  []
  ;; Clear memoized data
  (memoize/memo-clear! openai-memo)
  (memoize/memo-clear! collect-health-metrics-memo)
  {:status 200
   :body   (collect-health-metrics-memo 7)})
