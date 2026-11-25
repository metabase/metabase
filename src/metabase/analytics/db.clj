(ns metabase.analytics.db
  "Application database queries for the analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn first-user-date-joined
  "The earliest join date among all Users, or nil."
  []
  (t2/select-one-fn :min [:model/User [:%min.date_joined :min]]))

(mu/defn sample-database-exists?
  "Whether a sample Database exists."
  []
  (t2/exists? :model/Database, :is_sample true))

(mu/defn sample-database-id
  "The id of the sample Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(mu/defn personal-user-stats-columns
  "The active, superuser, last login, and SSO source of every personal User."
  []
  (t2/select [:model/User :is_active :is_superuser :last_login :sso_source] :type :personal))

(mu/defn document-archived-flags
  "The archived flag of every Document."
  []
  (t2/select [:model/Document :archived]))

(mu/defn collection-by-type
  "The id and location of a Collection of `collection-type`, or nil."
  [collection-type :- :string]
  (t2/select-one [:model/Collection :id :location] :type collection-type))

(mu/defn descendant-collection-ids
  "The ids of the Collections whose location starts with `location-prefix`, or nil."
  [location-prefix :- :string]
  (t2/select-pks-set :model/Collection :location [:like (str location-prefix "%")]))

(mu/defn published-table-count-in-collections
  "The number of published Tables in the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (transduce (map #(t2/count :model/TableUserSettings {:where [:and
                                                               [:= :is_published true]
                                                               [:in :collection_id %]]}))
             + 0 (app-db/select-partitions collection-ids)))

(mu/defn unarchived-metric-count-in-collections
  "The number of unarchived metric Cards in the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (transduce (map #(t2/count :model/Card {:where [:and
                                                  [:= :type "metric"]
                                                  [:= :archived false]
                                                  [:in :collection_id %]]}))
             + 0 (app-db/select-partitions collection-ids)))

(mu/defn permissions-group-count
  "The number of PermissionsGroups."
  []
  (t2/count :model/PermissionsGroup))

(mu/defn dashboard-stats-columns
  "The creator, public uuid, parameters, and embedding columns of the non-internal Dashboards."
  []
  (t2/select [:model/Dashboard :creator_id :public_uuid :parameters :enable_embedding :embedding_params]
             {:where (mi/non-internal-filter-clause :model/Dashboard (t2/table-name :model/Dashboard))}))

(mu/defn dashcards-of-dashboards
  "The DashboardCards of the non-internal Dashboards."
  []
  (t2/query {:select :dc.*
             :from [[(t2/table-name :model/DashboardCard) :dc]]
             :join [[(t2/table-name :model/Dashboard) :d] [:= :d.id :dc.dashboard_id]]
             :where (mi/non-internal-filter-clause :model/Dashboard :d)}))

(defn- notification-frequencies-by-column*
  [model column alerts? left-join?]
  (t2/select [model [column :k] [:%count.* :count]]
             (cond-> {:group-by [column]
                      :where    [(if alerts? :not= :=) (u/qualified-key (t2/table-name :model/Pulse) :alert_condition) nil]}
               left-join? (assoc :left-join [(t2/table-name :model/Pulse) [:= (u/qualified-key (t2/table-name :model/Pulse) :id) :pulse_id]]))))

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

(mu/defn pulse-count
  "The number of Pulses that are not alerts."
  []
  (t2/count :model/Pulse :alert_condition nil))

(mu/defn notification-xls-or-csv-card-count
  "The `:count` of Notifications with at least one PulseCard with `:include_xls` or `:include_csv`, of alerts when
  `alerts?`, or of pulses otherwise."
  [alerts? :- :boolean]
  (t2/query-one {:select    [[[::h2x/distinct-count (u/qualified-key (t2/table-name :model/Pulse) :id)] :count]]
                 :from      [(t2/table-name :model/Pulse)]
                 :left-join [(t2/table-name :model/PulseCard) [:= (u/qualified-key (t2/table-name :model/Pulse) :id) (u/qualified-key (t2/table-name :model/PulseCard) :pulse_id)]]
                 :where     [:and
                             [:or
                              [:= (u/qualified-key (t2/table-name :model/PulseCard) :include_csv) true]
                              [:= (u/qualified-key (t2/table-name :model/PulseCard) :include_xls) true]]
                             [(if alerts? :not= :=) :alert_condition nil]]}))

(mu/defn alert-count
  "The number of Pulses that are alerts."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil]))

(mu/defn first-time-only-alert-count
  "The number of alert Pulses that fire only once."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil], :alert_first_only true))

(mu/defn above-goal-alert-count
  "The number of alert Pulses that fire above their goal."
  []
  (t2/count :model/Pulse :alert_condition [:not= nil], :alert_above_goal true))

(mu/defn collection-count
  "The number of non-internal Collections."
  []
  (t2/count :model/Collection {:where (mi/non-internal-filter-clause :model/Collection (t2/table-name :model/Collection))}))

(mu/defn card-collection-ids
  "The Collection id of the non-internal Cards."
  []
  (t2/select [:model/Card :collection_id] {:where [:and (mi/non-internal-filter-clause :model/Card (t2/table-name :model/Card))]}))

(mu/defn database-stats-columns
  "The sync, engine, and DBMS version of the non-internal Databases."
  []
  (t2/select [:model/Database :is_full_sync :engine :dbms_version]
             {:where (mi/non-internal-filter-clause :model/Database (t2/table-name :model/Database))}))

(mu/defn table-database-and-schema
  "The Database id and schema of the Tables of the non-internal Databases."
  []
  (t2/query {:select [:t.db_id :t.schema]
             :from      [[(t2/table-name :model/Table) :t]]
             :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where  (mi/non-internal-filter-clause :model/Database :d)}))

(mu/defn field-table-ids
  "The Table id of the Fields of the non-internal Databases."
  []
  (t2/query {:select [:f.table_id]
             :from      [[(t2/table-name :model/Field) :f]]
             :join [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]
                    [(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where (mi/non-internal-filter-clause :model/Database :d)}))

(mu/defn segment-count
  "The number of Segments."
  []
  (t2/count :model/Segment))

(mu/defn unarchived-metric-card-count
  "The number of unarchived metric Cards."
  []
  (t2/count :model/Card :type :metric :archived false))

(defn- count-where
  "The number of rows matching `condition`, zero over no rows."
  [condition]
  [:coalesce [:sum [:case condition 1 :else 0]] 0])

(defn- execution-metrics-query
  "The query of the execution statistics over the QueryExecutions of the last 30 days, counted from an instant so that
  no daylight saving shift moves the cutoff, with the per-user counts in a derived table because H2 binds no parameter
  in a CTE that another CTE reads."
  []
  (let [recent          [:> :started_at (t/minus (t/instant) (t/days 30))]
        user-executions ^:allow-subquery {:select   [:executor_id [[:count :*] :num_executions]]
                                          :from     [[(t2/table-name :model/QueryExecution) :qe]]
                                          :where    recent
                                          :group-by [:executor_id]}]
    {:with   [[:query_stats_1 ^:allow-subquery
               {:select [[[:count :*] :executions]
                         [[:sum [:case [:or [:= :error nil] [:= [:length :error] 0]] 1 :else 0]] :by_status__completed]
                         [[:sum [:case [:or [:not= :error nil] [:> [:length :error] 0]] 1 :else 0]] :by_status__failed]
                         [(count-where [:= :running_time 0]) :num_by_latency__0]
                         [(count-where [:and [:> :running_time 0] [:< :running_time 1000]]) :num_by_latency__lt_1]
                         [(count-where [:and [:>= :running_time 1000] [:< :running_time 10000]]) :num_by_latency__1_10]
                         [(count-where [:and [:>= :running_time 10000] [:< :running_time 50000]]) :num_by_latency__11_50]
                         [(count-where [:and [:>= :running_time 50000] [:< :running_time 250000]]) :num_by_latency__51_250]
                         [(count-where [:and [:>= :running_time 250000] [:< :running_time 1000000]]) :num_by_latency__251_1000]
                         [(count-where [:and [:>= :running_time 1000000] [:< :running_time 10000000]]) :num_by_latency__1001_10000]
                         [(count-where [:>= :running_time 10000000]) :num_by_latency__10000_plus]]
                :from   [[(t2/table-name :model/QueryExecution) :qe]]
                :where  recent}]
              [:query_stats_2 ^:allow-subquery
               {:select [[(count-where [:= :num_executions 0]) :num_per_user__0]
                         [(count-where [:and [:> :num_executions 0] [:< :num_executions 1]]) :num_per_user__lt_1]
                         [(count-where [:and [:>= :num_executions 1] [:< :num_executions 10]]) :num_per_user__1_10]
                         [(count-where [:and [:>= :num_executions 10] [:< :num_executions 50]]) :num_per_user__11_50]
                         [(count-where [:and [:>= :num_executions 50] [:< :num_executions 250]]) :num_per_user__51_250]
                         [(count-where [:and [:>= :num_executions 250] [:< :num_executions 1000]]) :num_per_user__251_1000]
                         [(count-where [:and [:>= :num_executions 1000] [:< :num_executions 10000]]) :num_per_user__1001_10000]
                         [(count-where [:>= :num_executions 10000]) :num_per_user__10000_plus]]
                :from   [[user-executions :user_executions]]}]]
     :select [:q1.* :q2.*]
     :from   [[:query_stats_1 :q1] [:query_stats_2 :q2]]}))

(mu/defn execution-metrics
  "The execution statistics over the last 30 days of QueryExecutions."
  []
  (first (t2/query (execution-metrics-query))))

(mu/defn query-cache-stats
  "The average result `:length` and `:count` of the QueryCache entries."
  []
  (t2/select-one [:model/QueryCache [[:avg [:length :results]] :length] [:%count.* :count]]))

(mu/defn user-count-joined-before
  "The number (up to `limit`) of non-internal Users who joined at or before `joined-before`."
  [joined-before :- ms/TemporalInstant
   limit         :- ms/PositiveInt]
  (t2/count :model/User {:where [:and
                                 [:<= :date_joined joined-before]
                                 (mi/non-internal-filter-clause :model/User (t2/table-name :model/User))]
                         :limit limit}))

(mu/defn query-execution-ids-excluding-database
  "Up to `limit` ids of QueryExecutions not run against the Database with `database-id`."
  [database-id :- [:maybe ::lib.schema.id/database]
   limit       :- ms/PositiveInt]
  (t2/select-fn-set :id :model/QueryExecution
                    {:where [:or
                             [:not= :database_id database-id]
                             [:= :database_id nil]]
                     :limit limit}))

(mu/defn transform-count
  "The number of Transforms."
  []
  (t2/count :model/Transform))

(mu/defn transform-run-count-since
  "The number of TransformRuns started at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/TransformRun :start_time [:>= since]))

(mu/defn unarchived-model-count
  "The number of unarchived model Cards."
  []
  (t2/count :model/Card :type :model :archived false))

(mu/defn new-embedded-dashboard-count-since
  "The number of unarchived Dashboards with embedding enabled created at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/Dashboard :enable_embedding true :archived false :created_at [:>= since]))

(mu/defn new-active-user-count-since
  "The number of active Users who joined at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/User :is_active true :date_joined [:>= since]))

(mu/defn unarchived-pivot-table-count
  "The number of unarchived pivot table Cards."
  []
  (t2/count :model/Card :display :pivot :archived false))

(mu/defn query-execution-count-since
  "The number of QueryExecutions started at or after `since`."
  [since :- ms/TemporalInstant]
  (t2/count :model/QueryExecution :started_at [:>= since]))

(mu/defn database-engines-among
  "The set of engines of the Databases whose engine is one of `engine-names`."
  [engine-names :- [:sequential :string]]
  (t2/select-fn-set :engine :model/Database {:where [:in :engine engine-names]}))

(mu/defn embedded-dashboard-exists?
  "Whether a Dashboard with embedding enabled exists."
  []
  (t2/exists? :model/Dashboard :enable_embedding true))

(mu/defn embedded-card-exists?
  "Whether a Card with embedding enabled exists."
  []
  (t2/exists? :model/Card :enable_embedding true))

(mu/defn public-dashboard-exists?
  "Whether a publicly shared Dashboard exists."
  []
  (t2/exists? :model/Dashboard :public_uuid [:not= nil]))

(mu/defn public-card-exists?
  "Whether a publicly shared Card exists."
  []
  (t2/exists? :model/Card :public_uuid [:not= nil]))

(mu/defn custom-viz-plugin-exists?
  "Whether a CustomVizPlugin exists."
  []
  (t2/exists? :model/CustomVizPlugin))

(mu/defn uploads-database-exists?
  "Whether a Database with uploads enabled exists."
  []
  (t2/exists? :model/Database :uploads_enabled true))

(mu/defn official-collection-exists?
  "Whether an official Collection exists."
  []
  (t2/exists? :model/Collection :authority_level "official"))

(mu/defn cache-config-exists?
  "Whether any CacheConfig exists."
  []
  (t2/exists? :model/CacheConfig))

(mu/defn preemptive-cache-config-exists?
  "Whether a CacheConfig that refreshes automatically exists."
  []
  (t2/exists? :model/CacheConfig :refresh_automatically true))

(mu/defn database-router-exists?
  "Whether a DatabaseRouter exists."
  []
  (t2/exists? :model/DatabaseRouter))

(mu/defn moderation-review-exists?
  "Whether a ModerationReview exists."
  []
  (t2/exists? :model/ModerationReview))

(mu/defn filtered-pulse-exists?
  "Whether a Pulse with parameters exists."
  []
  (t2/exists? :model/Pulse {:where [:not= :parameters "[]"]}))

(mu/defn upload-table-exists?
  "Whether an uploaded Table exists."
  []
  (t2/exists? :model/Table :is_upload true))

(mu/defn snippet-collection-exists?
  "Whether a snippet Collection exists."
  []
  (t2/exists? :model/Collection :namespace "snippets"))

(mu/defn starburst-database-details
  "The connection details of the Starburst Databases."
  []
  (t2/select-fn-set :details :model/Database :engine "starburst"))
