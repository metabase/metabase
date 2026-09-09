(ns metabase.analytics.db
  "Application database queries for the analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.collections.schema :as collections.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.documents.schema :as documents.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.queries.schema :as queries.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn first-user-date-joined :- [:maybe ms/TemporalInstant]
  "The earliest join date among all Users, or nil."
  []
  (t2/select-one-fn :min [:model/User [:%min.date_joined :min]]))

(mu/defn sample-database-exists? :- :boolean
  "Whether a sample Database exists."
  []
  (t2/exists? :model/Database, :is_sample true))

(mu/defn sample-database-id :- [:maybe ::lib.schema.id/database]
  "The id of the sample Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(def ^:private PersonalUserStatsColumn
  "Rows returned by [[personal-user-stats-columns]]."
  (mut/select-keys ::users.schema/user.full
                   [:is_active :is_superuser :last_login :sso_source :common_name]))

(mu/defn personal-user-stats-columns :- [:sequential PersonalUserStatsColumn]
  "The active, superuser, last login, and SSO source of every personal User."
  []
  (t2/select [:model/User :is_active :is_superuser :last_login :sso_source] :type :personal))

(def ^:private DocumentArchivedFlag
  "Rows returned by [[document-archived-flags]]."
  (mut/select-keys ::documents.schema/document [:archived]))

(mu/defn document-archived-flags :- [:sequential DocumentArchivedFlag]
  "The archived flag of every Document."
  []
  (t2/select [:model/Document :archived]))

(def ^:private CollectionByType
  "Rows returned by [[collection-by-type]]."
  (mut/select-keys ::collections.schema/collection [:id :location]))

(mu/defn collection-by-type :- [:maybe CollectionByType]
  "The id and location of a Collection of `collection-type`, or nil."
  [collection-type :- :string]
  (t2/select-one [:model/Collection :id :location] :type collection-type))

(mu/defn descendant-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]
  "The ids of the Collections whose location starts with `location-prefix`, or nil."
  [location-prefix :- :string]
  (t2/select-pks-set :model/Collection :location [:like (str location-prefix "%")]))

(mu/defn published-table-count-in-collections :- ms/IntGreaterThanOrEqualToZero
  "The number of published Tables in the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/count :model/Table {:where [:and
                                  [:= :is_published true]
                                  [:in :collection_id collection-ids]]}))

(mu/defn unarchived-metric-count-in-collections :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived metric Cards in the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/count :model/Card {:where [:and
                                 [:= :type "metric"]
                                 [:= :archived false]
                                 [:in :collection_id collection-ids]]}))

(mu/defn permissions-group-count :- ms/IntGreaterThanOrEqualToZero
  "The number of PermissionsGroups."
  []
  (t2/count :model/PermissionsGroup))

(def ^:private DashboardStatsColumn
  "Rows returned by [[dashboard-stats-columns]]."
  (mut/select-keys ::dashboards.schema/dashboard
                   [:creator_id :public_uuid :parameters :enable_embedding :embedding_params]))

(mu/defn dashboard-stats-columns :- [:sequential DashboardStatsColumn]
  "The creator, public uuid, parameters, and embedding columns of the non-internal Dashboards."
  []
  (t2/select [:model/Dashboard :creator_id :public_uuid :parameters :enable_embedding :embedding_params]
             {:where (mi/exclude-internal-content-hsql :model/Dashboard)}))

(mu/defn dashcards-of-dashboards :- [:sequential :map]
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

(mu/defn pulse-channel-frequencies-by-column :- [:sequential ms/PositiveInt]
  "The distinct `column` values (as `:k`) and their `:count` among the PulseChannels of alerts when `alerts?`, or of
  pulses otherwise."
  [column  :- :keyword
   alerts? :- :boolean]
  (notification-frequencies-by-column* :model/PulseChannel column alerts? true))

(mu/defn pulse-frequencies-by-column :- [:sequential ::lib.schema.id/pulse]
  "The distinct `column` values (as `:k`) and their `:count` among the Pulses of alerts when `alerts?`, or of pulses
  otherwise."
  [column  :- :keyword
   alerts? :- :boolean]
  (notification-frequencies-by-column* :model/Pulse column alerts? false))

(mu/defn pulse-card-frequencies-by-column :- [:sequential ms/PositiveInt]
  "The distinct `column` values (as `:k`) and their `:count` among the PulseCards of alerts when `alerts?`, or of
  pulses otherwise."
  [column  :- :keyword
   alerts? :- :boolean]
  (notification-frequencies-by-column* :model/PulseCard column alerts? true))

(mu/defn pulse-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Pulses that are not alerts."
  []
  (t2/count :model/Pulse :alert_condition nil))

(mu/defn notification-xls-or-csv-card-count :- [:map {:closed true} [:count :int]]
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

(mu/defn alert-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Pulses that are alerts."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil]))

(mu/defn first-time-only-alert-count :- ms/IntGreaterThanOrEqualToZero
  "The number of alert Pulses that fire only once."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil], :alert_first_only true))

(mu/defn above-goal-alert-count :- ms/IntGreaterThanOrEqualToZero
  "The number of alert Pulses that fire above their goal."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil], :alert_above_goal true))

(mu/defn collection-count :- ms/IntGreaterThanOrEqualToZero
  "The number of non-internal Collections."
  []
  (t2/count :model/Collection {:where (mi/exclude-internal-content-hsql :model/Collection)}))

(def ^:private CardCollectionId
  "Rows returned by [[card-collection-ids]]."
  (mut/select-keys ::queries.schema/card [:collection_id :card_schema]))

(mu/defn card-collection-ids :- [:sequential CardCollectionId]
  "The Collection id and schema of the non-internal Cards."
  []
  (t2/select [:model/Card :collection_id :card_schema] {:where [:and (mi/exclude-internal-content-hsql :model/Card)]}))

(def ^:private DatabaseStatsColumn
  "Rows returned by [[database-stats-columns]]."
  (mut/select-keys ::warehouses.schema/database [:is_full_sync :engine :dbms_version :features]))

(mu/defn database-stats-columns :- [:sequential DatabaseStatsColumn]
  "The sync, engine, and DBMS version of the non-internal Databases."
  []
  (t2/select [:model/Database :is_full_sync :engine :dbms_version]
             {:where (mi/exclude-internal-content-hsql :model/Database)}))

(def ^:private TableDatabaseAndSchema
  "Rows returned by [[table-database-and-schema]]."
  [:map {:closed true}
   [:db_id  [:maybe ::lib.schema.id/database]]
   [:schema [:maybe :string]]])

(mu/defn table-database-and-schema :- [:sequential TableDatabaseAndSchema]
  "The Database id and schema of the Tables of the non-internal Databases."
  []
  (t2/query {:select [:t.db_id :t.schema]
             :from   [[(t2/table-name :model/Table) :t]]
             :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where  (mi/exclude-internal-content-hsql :model/Database :table-alias :d)}))

(def ^:private FieldTableId
  "Rows returned by [[field-table-ids]]."
  [:map {:closed true}
   [:table_id [:maybe ::lib.schema.id/table]]])

(mu/defn field-table-ids :- [:sequential FieldTableId]
  "The Table id of the Fields of the non-internal Databases."
  []
  (t2/query {:select [:f.table_id]
             :from [[(t2/table-name :model/Field) :f]]
             :join [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]
                    [(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where (mi/exclude-internal-content-hsql :model/Database :table-alias :d)}))

(mu/defn segment-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Segments."
  []
  (t2/count :model/Segment))

(mu/defn unarchived-metric-card-count :- ms/IntGreaterThanOrEqualToZero
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

(def ^:private ExecutionMetric
  "Rows returned by [[execution-metrics]]."
  [:map {:closed true}
   [:executions                  :int]
   ;; SUM() over an empty query_execution table is SQL NULL, not 0 -- unlike
   ;; the other columns below, these two aren't wrapped in COALESCE
   [:by_status__completed        [:maybe :int]]
   [:by_status__failed           [:maybe :int]]
   [:num_by_latency__0           :int]
   [:num_by_latency__lt_1        :int]
   [:num_by_latency__1_10        :int]
   [:num_by_latency__11_50       :int]
   [:num_by_latency__51_250      :int]
   [:num_by_latency__251_1000    :int]
   [:num_by_latency__1001_10000  :int]
   [:num_by_latency__10000_plus  :int]
   [:num_per_user__0             :int]
   [:num_per_user__lt_1          :int]
   [:num_per_user__1_10          :int]
   [:num_per_user__11_50         :int]
   [:num_per_user__51_250        :int]
   [:num_per_user__251_1000      :int]
   [:num_per_user__1001_10000    :int]
   [:num_per_user__10000_plus    :int]])

(mu/defn execution-metrics :- [:maybe ExecutionMetric]
  "The execution statistics over the last 30 days of QueryExecutions."
  []
  (first (t2/query (execution-metrics-sql))))

(def ^:private QueryCacheStat
  "Rows returned by [[query-cache-stats]]."
  [:map {:closed true}
   [:length [:maybe number?]]
   [:count  :int]])

(mu/defn query-cache-stats :- [:maybe QueryCacheStat]
  "The average result `:length` and `:count` of the QueryCache entries."
  []
  (t2/select-one [:model/QueryCache [[:avg [:length :results]] :length] [:%count.* :count]]))

(mu/defn user-count-joined-before :- ms/IntGreaterThanOrEqualToZero
  "The number (up to `limit`) of non-internal Users who joined at or before `joined-before`."
  [joined-before :- ms/TemporalInstant
   limit         :- ms/PositiveInt]
  (t2/count :model/User {:where [:and
                                 [:<= :date_joined joined-before]
                                 (mi/exclude-internal-content-hsql :model/User)]
                         :limit limit}))

(mu/defn query-execution-ids-excluding-database :- [:maybe [:set ms/PositiveInt]]
  "Up to `limit` ids of QueryExecutions not run against the Database with `database-id`."
  [database-id :- [:maybe ::lib.schema.id/database]
   limit       :- ms/PositiveInt]
  (t2/select-fn-set :id :model/QueryExecution
                    {:where [:or
                             [:not= :database_id database-id]
                             [:= :database_id nil]]
                     :limit limit}))

(mu/defn transform-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Transforms."
  []
  (t2/count :model/Transform))

(mu/defn transform-run-count-since :- ms/IntGreaterThanOrEqualToZero
  "The number of TransformRuns started at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/TransformRun :start_time [:>= since]))

(mu/defn unarchived-model-count :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived model Cards."
  []
  (t2/count :model/Card :type :model :archived false))

(mu/defn new-embedded-dashboard-count-since :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived Dashboards with embedding enabled created at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/Dashboard :enable_embedding true :archived false :created_at [:>= since]))

(mu/defn new-active-user-count-since :- ms/IntGreaterThanOrEqualToZero
  "The number of active Users who joined at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/User :is_active true :date_joined [:>= since]))

(mu/defn unarchived-pivot-table-count :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived pivot table Cards."
  []
  (t2/count :model/Card :display :pivot :archived false))

(mu/defn query-execution-count-since :- ms/IntGreaterThanOrEqualToZero
  "The number of QueryExecutions started at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/QueryExecution :started_at [:>= since]))

(mu/defn new-scim-user-count-since :- ms/IntGreaterThanOrEqualToZero
  "The number of active SCIM-provisioned Users who joined at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/User :sso_source :scim :is_active true :date_joined [:>= since]))

(mu/defn database-engines-among :- [:maybe [:set :keyword]]
  "The set of engines of the Databases whose engine is one of `engine-names`."
  [engine-names :- [:sequential :string]]
  (t2/select-fn-set :engine :model/Database {:where [:in :engine engine-names]}))

(mu/defn embedded-dashboard-exists? :- :boolean
  "Whether a Dashboard with embedding enabled exists."
  []
  (t2/exists? :model/Dashboard :enable_embedding true))

(mu/defn embedded-card-exists? :- :boolean
  "Whether a Card with embedding enabled exists."
  []
  (t2/exists? :model/Card :enable_embedding true))

(mu/defn public-dashboard-exists? :- :boolean
  "Whether a publicly shared Dashboard exists."
  []
  (t2/exists? :model/Dashboard :public_uuid [:not= nil]))

(mu/defn public-card-exists? :- :boolean
  "Whether a publicly shared Card exists."
  []
  (t2/exists? :model/Card :public_uuid [:not= nil]))

(mu/defn custom-viz-plugin-exists? :- :boolean
  "Whether a CustomVizPlugin exists."
  []
  (t2/exists? :model/CustomVizPlugin))

(mu/defn uploads-database-exists? :- :boolean
  "Whether a Database with uploads enabled exists."
  []
  (t2/exists? :model/Database :uploads_enabled true))

(mu/defn official-collection-exists? :- :boolean
  "Whether an official Collection exists."
  []
  (t2/exists? :model/Collection :authority_level "official"))

(mu/defn cache-config-exists? :- :boolean
  "Whether any CacheConfig exists."
  []
  (t2/exists? :model/CacheConfig))

(mu/defn preemptive-cache-config-exists? :- :boolean
  "Whether a CacheConfig that refreshes automatically exists."
  []
  (t2/exists? :model/CacheConfig :refresh_automatically true))

(mu/defn database-router-exists? :- :boolean
  "Whether a DatabaseRouter exists."
  []
  (t2/exists? :model/DatabaseRouter))

(mu/defn moderation-review-exists? :- :boolean
  "Whether a ModerationReview exists."
  []
  (t2/exists? :model/ModerationReview))

(mu/defn filtered-pulse-exists? :- :boolean
  "Whether a Pulse with parameters exists."
  []
  (t2/exists? :model/Pulse {:where [:not= :parameters "[]"]}))

(mu/defn upload-table-exists? :- :boolean
  "Whether an uploaded Table exists."
  []
  (t2/exists? :model/Table :is_upload true))

(mu/defn snippet-collection-exists? :- :boolean
  "Whether a snippet Collection exists."
  []
  (t2/exists? :model/Collection :namespace "snippets"))

(mu/defn starburst-database-details :- [:maybe [:set [:maybe :map]]]
  "The connection details of the Starburst Databases."
  []
  (t2/select-fn-set :details :model/Database :engine "starburst"))
