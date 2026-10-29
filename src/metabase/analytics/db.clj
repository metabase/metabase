(ns metabase.analytics.db
  "Application database queries for the analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn dashcards-of-dashboards
  "The DashboardCards of the non-internal Dashboards."
  []
  (t2/query {:select :dc.*
             :from [[(t2/table-name :model/DashboardCard) :dc]]
             :join [[(t2/table-name :model/Dashboard) :d] [:= :d.id :dc.dashboard_id]]
             :where (mi/exclude-internal-content-hsql :model/Dashboard :table-alias :d)}))

(defn- notification-frequencies-by-column*
  [model column alerts? left-join?]
  (t2/select [model [column :k] [:%count.* :count]]
             (cond-> {:group-by [column]
                      :where    [(if alerts? :not= :=) :pulse.alert_condition nil]}
               left-join? (assoc :left-join [:pulse [:= :pulse.id :pulse_id]]))))

(mu/defn pulse-channel-frequencies-by-column
  "The distinct `column` values (as `:k`) and their `:count` among the PulseChannels of alerts when `alerts?`, or of
  pulses otherwise."
  [column  :- :keyword
   alerts? :- :boolean]
  (notification-frequencies-by-column* :model/PulseChannel column alerts? true))

(mu/defn pulse-frequencies-by-column
  "The distinct `column` values (as `:k`) and their `:count` among the Pulses of alerts when `alerts?`, or of pulses
  otherwise."
  [column  :- :keyword
   alerts? :- :boolean]
  (notification-frequencies-by-column* :model/Pulse column alerts? false))

(mu/defn pulse-card-frequencies-by-column
  "The distinct `column` values (as `:k`) and their `:count` among the PulseCards of alerts when `alerts?`, or of
  pulses otherwise."
  [column  :- :keyword
   alerts? :- :boolean]
  (notification-frequencies-by-column* :model/PulseCard column alerts? true))

(mu/defn notification-xls-or-csv-card-count
  "The `:count` of Notifications with at least one PulseCard with `:include_xls` or `:include_csv`, of alerts when
  `alerts?`, or of pulses otherwise."
  [alerts? :- :boolean]
  (t2/query-one {:select    [[[::h2x/distinct-count :pulse.id] :count]]
                 :from      [:pulse]
                 :left-join [:pulse_card [:= :pulse.id :pulse_card.pulse_id]]
                 :where     [:and
                             [:or
                              [:= :pulse_card.include_csv true]
                              [:= :pulse_card.include_xls true]]
                             [(if alerts? :not= :=) :alert_condition nil]]}))

(mu/defn table-database-and-schema
  "The Database id and schema of the Tables of the non-internal Databases."
  []
  (t2/query {:select [:t.db_id :t.schema]
             :from      [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
             :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where  (mi/exclude-internal-content-hsql :model/Database :table-alias :d)}))

(mu/defn field-table-ids
  "The Table id of the Fields of the non-internal Databases."
  []
  (t2/query {:select [:f.table_id]
             :from      [(warehouse-schema-overlay/field-query {:alias :f})]
             :join [(warehouse-schema-overlay/table-query {:alias :t}) [:= :t.id :f.table_id]
                    [(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where (mi/exclude-internal-content-hsql :model/Database :table-alias :d)}))

(defn- execution-metrics-sql []
  ;; Postgres automatically adjusts for daylight saving time when performing time calculations on TIMESTAMP WITH TIME
  ;; ZONE. This can cause discrepancies when subtracting 30 days if the calculation crosses a DST boundary (e.g., in the
  ;; Pacific/Auckland timezone). To avoid this, we ensure all date computations are done in UTC on Postgres to prevent
  ;; any time shifts due to DST. See PR #48204
  (let [thirty-days-ago (case (app-db/db-type)
                          :postgres "CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '30 days'"
                          :h2       "DATEADD('DAY', -30, CURRENT_TIMESTAMP)"
                          :mysql    "CURRENT_TIMESTAMP - INTERVAL 30 DAY")
        started-at      (case (app-db/db-type)
                          :postgres "started_at AT TIME ZONE 'UTC'"
                          :h2       "started_at"
                          :mysql    "started_at")
        timestamp-where (str started-at " > " thirty-days-ago)]
    (str/join
     "\n"
     ["WITH user_executions AS ("
      "    SELECT executor_id, COUNT(*) AS num_executions"
      "    FROM query_execution"
      "    WHERE " timestamp-where
      "    GROUP BY executor_id"
      "),"
      "query_stats_1 AS ("
      "    SELECT"
      "        COUNT(*) AS executions,"
      "        SUM(CASE WHEN error IS NULL OR length(error) = 0 THEN 1 ELSE 0 END) AS by_status__completed,"
      "        SUM(CASE WHEN error IS NOT NULL OR length(error) > 0 THEN 1 ELSE 0 END) AS by_status__failed,"
      "        COALESCE(SUM(CASE WHEN running_time = 0 THEN 1 ELSE 0 END), 0) AS num_by_latency__0,"
      "        COALESCE(SUM(CASE WHEN running_time > 0 AND running_time < 1000 THEN 1 ELSE 0 END), 0) AS num_by_latency__lt_1,"
      "        COALESCE(SUM(CASE WHEN running_time >= 1000 AND running_time < 10000 THEN 1 ELSE 0 END), 0) AS num_by_latency__1_10,"
      "        COALESCE(SUM(CASE WHEN running_time >= 10000 AND running_time < 50000 THEN 1 ELSE 0 END), 0) AS num_by_latency__11_50,"
      "        COALESCE(SUM(CASE WHEN running_time >= 50000 AND running_time < 250000 THEN 1 ELSE 0 END), 0) AS num_by_latency__51_250,"
      "        COALESCE(SUM(CASE WHEN running_time >= 250000 AND running_time < 1000000 THEN 1 ELSE 0 END), 0) AS num_by_latency__251_1000,"
      "        COALESCE(SUM(CASE WHEN running_time >= 1000000 AND running_time < 10000000 THEN 1 ELSE 0 END), 0) AS num_by_latency__1001_10000,"
      "        COALESCE(SUM(CASE WHEN running_time >= 10000000 THEN 1 ELSE 0 END), 0) AS num_by_latency__10000_plus"
      "    FROM query_execution"
      "    WHERE " timestamp-where
      "),"
      "query_stats_2 AS ("
      "    SELECT"
      "        COALESCE(SUM(CASE WHEN num_executions = 0 THEN 1 ELSE 0 END), 0) AS num_per_user__0,"
      "        COALESCE(SUM(CASE WHEN num_executions > 0 AND num_executions < 1 THEN 1 ELSE 0 END), 0) AS num_per_user__lt_1,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 1 AND num_executions < 10 THEN 1 ELSE 0 END), 0) AS num_per_user__1_10,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 10 AND num_executions < 50 THEN 1 ELSE 0 END), 0) AS num_per_user__11_50,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 50 AND num_executions < 250 THEN 1 ELSE 0 END), 0) AS num_per_user__51_250,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 250 AND num_executions < 1000 THEN 1 ELSE 0 END), 0) AS num_per_user__251_1000,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 1000 AND num_executions < 10000 THEN 1 ELSE 0 END), 0) AS num_per_user__1001_10000,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 10000 THEN 1 ELSE 0 END), 0) AS num_per_user__10000_plus"
      "    FROM user_executions"
      ")"
      "SELECT q1.*, q2.* FROM query_stats_1 q1, query_stats_2 q2;"])))

(mu/defn execution-metrics
  "The execution statistics over the last 30 days of QueryExecutions."
  []
  (first (t2/query (execution-metrics-sql))))

(mu/defn first-user-date-joined
  "The earliest join date among all Users, or nil."
  []
  (t2/select-one-fn :min [:model/User [:%min.date_joined :min]]))

(mu/defn personal-user-stats-columns
  "The active, superuser, last login, and SSO source of every personal User."
  []
  (t2/select [:model/User :is_active :is_superuser :last_login :sso_source] :type :personal))

(mu/defn permissions-group-count
  "The number of PermissionsGroups."
  []
  (t2/count :model/PermissionsGroup))

(mu/defn user-count-joined-before
  "The number (up to `limit`) of non-internal Users who joined at or before `joined-before`."
  [joined-before :- ms/TemporalInstant
   limit         :- ms/PositiveInt]
  (t2/count :model/User {:where [:and
                                 [:<= :date_joined joined-before]
                                 (mi/exclude-internal-content-hsql :model/User)]
                         :limit limit}))

(mu/defn new-active-user-count-since
  "The number of active Users who joined at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/User :is_active true :date_joined [:>= since]))

(mu/defn transform-count
  "The number of Transforms."
  []
  (t2/count :model/Transform))

(mu/defn transform-run-count-since
  "The number of TransformRuns started at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/TransformRun :start_time [:>= since]))

(mu/defn database-router-exists?
  "Whether a DatabaseRouter exists."
  []
  (t2/exists? :model/DatabaseRouter))

(mu/defn custom-viz-plugin-exists?
  "Whether a CustomVizPlugin exists."
  []
  (t2/exists? :model/CustomVizPlugin))
