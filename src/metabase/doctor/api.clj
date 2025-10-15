(ns metabase.doctor.api
  (:require
   [clj-http.client :as http]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase.api.macros :as api.macros]
   [metabase.settings.models.setting :as setting]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-query-execution-stats
  "Get query execution statistics for the last N days"
  [days]
  {:total-queries (t2/count :model/QueryExecution
                            {:where [:>= :started_at (t/minus (t/instant) (t/days days))]})

   :error-queries (t2/count :model/QueryExecution
                            {:where [:and
                                     [:>= :started_at (t/minus (t/instant) (t/days days))]
                                     [:not= :error nil]]})
   :slow-queries  (t2/select :model/QueryExecution {:select [:id :database_id :running_time :error :context]
                                                    :from [:query_execution]
                                                    :where [:and
                                                            [:>= :started_at (t/minus (t/instant) (t/days days))]
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
                                                        [:= :ended_at nil]]
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
   :task-stats (get-task-history-stats days)})
  ;;  :database-stats (get-database-stats)
  ;;  :pulse-stats (get-pulse-stats)
  ;;  :cache-settings (get-cache-settings)


(def ^:private analysis-prompt
  "Analyze this Metabase instance health data and generate a comprehensive diagnostic report.

Focus on identifying:
1. Critical issues (potential OOM risks, 100% failure rates, etc)
2. Performance problems (slow queries, timeouts)
3. Configuration issues (cache settings, memory)
4. Failed tasks (sync, fingerprint, pulses)
5. Database issues (excessive field counts, sync problems)

Generate a markdown report with:
- Executive Summary with severity indicators (🔴 Critical, 🟡 Warning, 🟢 Good)
- Detailed findings for each issue category
- Specific, actionable recommendations
- Priority ranking of issues to fix

Be specific about which databases, queries, or tasks are problematic.
Use tables and formatting to make the report easy to scan.")

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

(api.macros/defendpoint :get "/"
  "Doctor endpoint that calls OpenAI with 'Hello' prompt"
  []
  {:status 200
   :body   {:reportMarkdown (call-openai analysis-prompt (collect-health-metrics 1))}})
