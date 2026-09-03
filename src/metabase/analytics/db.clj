(ns metabase.analytics.db
  "Application database queries for the analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn first-user-date-joined
  "The earliest join date among all Users, or nil."
  []
  (t2/select-one-fn :min [:model/User [:%min.date_joined :min]]))

(defn sample-database-exists?
  "Whether a sample Database exists."
  []
  (t2/exists? :model/Database, :is_sample true))

(defn sample-database-id
  "The id of the sample Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(defn personal-user-stats-columns
  "The active, superuser, last login, and SSO source of every personal User."
  []
  (t2/select [:model/User :is_active :is_superuser :last_login :sso_source] :type :personal))

(defn document-archived-flags
  "The archived flag of every Document."
  []
  (t2/select [:model/Document :archived]))

(defn collection-by-type
  "The id and location of a Collection of `collection-type`, or nil."
  [collection-type]
  (t2/select-one [:model/Collection :id :location] :type collection-type))

(defn descendant-collection-ids
  "The ids of the Collections whose location starts with `location-prefix`, or nil."
  [location-prefix]
  (t2/select-pks-set :model/Collection :location [:like (str location-prefix "%")]))

(defn published-table-count-in-collections
  "The number of published Tables in the Collections with `collection-ids`."
  [collection-ids]
  (t2/count :model/Table {:where [:and
                                  [:= :is_published true]
                                  [:in :collection_id collection-ids]]}))

(defn unarchived-metric-count-in-collections
  "The number of unarchived metric Cards in the Collections with `collection-ids`."
  [collection-ids]
  (t2/count :model/Card {:where [:and
                                 [:= :type "metric"]
                                 [:= :archived false]
                                 [:in :collection_id collection-ids]]}))

(defn permissions-group-count
  "The number of PermissionsGroups."
  []
  (t2/count :model/PermissionsGroup))

(defn dashboard-stats-columns
  "The creator, public uuid, parameters, and embedding columns of the non-internal Dashboards."
  []
  (t2/select [:model/Dashboard :creator_id :public_uuid :parameters :enable_embedding :embedding_params]
             {:where (mi/exclude-internal-content-hsql :model/Dashboard)}))

(defn dashcards-of-dashboards
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

(defn pulse-channel-frequencies-by-column
  "The distinct `column` values (as `:k`) and their `:count` among the PulseChannels of alerts when `alerts?`, or of
  pulses otherwise."
  [column alerts?]
  (notification-frequencies-by-column* :model/PulseChannel column alerts? true))

(defn pulse-frequencies-by-column
  "The distinct `column` values (as `:k`) and their `:count` among the Pulses of alerts when `alerts?`, or of pulses
  otherwise."
  [column alerts?]
  (notification-frequencies-by-column* :model/Pulse column alerts? false))

(defn pulse-card-frequencies-by-column
  "The distinct `column` values (as `:k`) and their `:count` among the PulseCards of alerts when `alerts?`, or of
  pulses otherwise."
  [column alerts?]
  (notification-frequencies-by-column* :model/PulseCard column alerts? true))

(defn pulse-count
  "The number of Pulses that are not alerts."
  []
  (t2/count :model/Pulse :alert_condition nil))

(defn notification-xls-or-csv-card-count
  "The `:count` of Notifications with at least one PulseCard with `:include_xls` or `:include_csv`, of alerts when
  `alerts?`, or of pulses otherwise."
  [alerts?]
  (t2/query-one {:select    [[[::h2x/distinct-count :pulse.id] :count]]
                 :from      [:pulse]
                 :left-join [:pulse_card [:= :pulse.id :pulse_card.pulse_id]]
                 :where     [:and
                             [:or
                              [:= :pulse_card.include_csv true]
                              [:= :pulse_card.include_xls true]]
                             [(if alerts? :not= :=) :alert_condition nil]]}))

(defn alert-count
  "The number of Pulses that are alerts."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil]))

(defn first-time-only-alert-count
  "The number of alert Pulses that fire only once."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil], :alert_first_only true))

(defn above-goal-alert-count
  "The number of alert Pulses that fire above their goal."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil], :alert_above_goal true))

(defn collection-count
  "The number of non-internal Collections."
  []
  (t2/count :model/Collection {:where (mi/exclude-internal-content-hsql :model/Collection)}))

(defn card-collection-ids
  "The Collection id and schema of the non-internal Cards."
  []
  (t2/select [:model/Card :collection_id :card_schema] {:where [:and (mi/exclude-internal-content-hsql :model/Card)]}))

(defn database-stats-columns
  "The sync, engine, and DBMS version of the non-internal Databases."
  []
  (t2/select [:model/Database :is_full_sync :engine :dbms_version]
             {:where (mi/exclude-internal-content-hsql :model/Database)}))

(defn table-database-and-schema
  "The Database id and schema of the Tables of the non-internal Databases."
  []
  (t2/query {:select [:t.db_id :t.schema]
             :from   [[(t2/table-name :model/Table) :t]]
             :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where  (mi/exclude-internal-content-hsql :model/Database :table-alias :d)}))

(defn field-table-ids
  "The Table id of the Fields of the non-internal Databases."
  []
  (t2/query {:select [:f.table_id]
             :from [[(t2/table-name :model/Field) :f]]
             :join [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]
                    [(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where (mi/exclude-internal-content-hsql :model/Database :table-alias :d)}))

(defn segment-count
  "The number of Segments."
  []
  (t2/count :model/Segment))

(defn unarchived-metric-card-count
  "The number of unarchived metric Cards."
  []
  (t2/count :model/Card :type :metric :archived false))

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

(defn execution-metrics
  "The execution statistics over the last 30 days of QueryExecutions."
  []
  (first (t2/query (execution-metrics-sql))))

(defn query-cache-stats
  "The average result `:length` and `:count` of the QueryCache entries."
  []
  (t2/select-one [:model/QueryCache [[:avg [:length :results]] :length] [:%count.* :count]]))

(defn user-count-joined-before
  "The number (up to `limit`) of non-internal Users who joined at or before `joined-before`."
  [joined-before limit]
  (t2/count :model/User {:where [:and
                                 [:<= :date_joined joined-before]
                                 (mi/exclude-internal-content-hsql :model/User)]
                         :limit limit}))

(defn query-execution-ids-excluding-database
  "Up to `limit` ids of QueryExecutions not run against the Database with `database-id`."
  [database-id limit]
  (t2/select-fn-set :id :model/QueryExecution
                    {:where [:or
                             [:not= :database_id database-id]
                             [:= :database_id nil]]
                     :limit limit}))

(defn transform-count
  "The number of Transforms."
  []
  (t2/count :model/Transform))

(defn transform-run-count-since
  "The number of TransformRuns started at or after `since`."
  [since]
  (t2/count :model/TransformRun :start_time [:>= since]))

(defn unarchived-model-count
  "The number of unarchived model Cards."
  []
  (t2/count :model/Card :type :model :archived false))

(defn new-embedded-dashboard-count-since
  "The number of unarchived Dashboards with embedding enabled created at or after `since`."
  [since]
  (t2/count :model/Dashboard :enable_embedding true :archived false :created_at [:>= since]))

(defn new-active-user-count-since
  "The number of active Users who joined at or after `since`."
  [since]
  (t2/count :model/User :is_active true :date_joined [:>= since]))

(defn unarchived-pivot-table-count
  "The number of unarchived pivot table Cards."
  []
  (t2/count :model/Card :display :pivot :archived false))

(defn query-execution-count-since
  "The number of QueryExecutions started at or after `since`."
  [since]
  (t2/count :model/QueryExecution :started_at [:>= since]))

(defn new-scim-user-count-since
  "The number of active SCIM-provisioned Users who joined at or after `since`."
  [since]
  (t2/count :model/User :sso_source :scim :is_active true :date_joined [:>= since]))

(defn database-engines-among
  "The set of engines of the Databases whose engine is one of `engine-names`."
  [engine-names]
  (t2/select-fn-set :engine :model/Database {:where [:in :engine engine-names]}))

(defn embedded-dashboard-exists?
  "Whether a Dashboard with embedding enabled exists."
  []
  (t2/exists? :model/Dashboard :enable_embedding true))

(defn embedded-card-exists?
  "Whether a Card with embedding enabled exists."
  []
  (t2/exists? :model/Card :enable_embedding true))

(defn public-dashboard-exists?
  "Whether a publicly shared Dashboard exists."
  []
  (t2/exists? :model/Dashboard :public_uuid [:not= nil]))

(defn public-card-exists?
  "Whether a publicly shared Card exists."
  []
  (t2/exists? :model/Card :public_uuid [:not= nil]))

(defn custom-viz-plugin-exists?
  "Whether a CustomVizPlugin exists."
  []
  (t2/exists? :model/CustomVizPlugin))

(defn uploads-database-exists?
  "Whether a Database with uploads enabled exists."
  []
  (t2/exists? :model/Database :uploads_enabled true))

(defn official-collection-exists?
  "Whether an official Collection exists."
  []
  (t2/exists? :model/Collection :authority_level "official"))

(defn cache-config-exists?
  "Whether any CacheConfig exists."
  []
  (t2/exists? :model/CacheConfig))

(defn preemptive-cache-config-exists?
  "Whether a CacheConfig that refreshes automatically exists."
  []
  (t2/exists? :model/CacheConfig :refresh_automatically true))

(defn database-router-exists?
  "Whether a DatabaseRouter exists."
  []
  (t2/exists? :model/DatabaseRouter))

(defn moderation-review-exists?
  "Whether a ModerationReview exists."
  []
  (t2/exists? :model/ModerationReview))

(defn filtered-pulse-exists?
  "Whether a Pulse with parameters exists."
  []
  (t2/exists? :model/Pulse {:where [:not= :parameters "[]"]}))

(defn upload-table-exists?
  "Whether an uploaded Table exists."
  []
  (t2/exists? :model/Table :is_upload true))

(defn snippet-collection-exists?
  "Whether a snippet Collection exists."
  []
  (t2/exists? :model/Collection :namespace "snippets"))

(defn starburst-database-details
  "The connection details of the Starburst Databases."
  []
  (t2/select-fn-set :details :model/Database :engine "starburst"))
