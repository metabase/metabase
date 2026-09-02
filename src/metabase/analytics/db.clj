(ns metabase.analytics.db
  "Application database queries for the analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn first-user-date-joined-row
  "The `:min` join date of all Users."
  []
  (t2/select-one [:model/User [:%min.date_joined :min]]))

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
  "The creator, public uuid, parameters, and embedding columns of the Dashboards matching the Honey SQL `where`
  clause."
  [where]
  (t2/select [:model/Dashboard :creator_id :public_uuid :parameters :enable_embedding :embedding_params]
             {:where where}))

(defn dashcards-of-dashboards
  "The DashboardCards of the Dashboards (aliased `d`) matching the Honey SQL `where` clause."
  [where]
  (t2/query {:select :dc.*
             :from [[(t2/table-name :model/DashboardCard) :dc]]
             :join [[(t2/table-name :model/Dashboard) :d] [:= :d.id :dc.dashboard_id]]
             :where where}))

(defn frequencies-by-column
  "The distinct `column` values (as `:k`) and their `:count` among the `model` rows also selected by the Honey SQL
  `query`."
  [model column query]
  (t2/select [model [column :k] [:%count.* :count]] (merge {:group-by [column]} query)))

(defn pulse-count
  "The number of Pulses that are not alerts."
  []
  (t2/count :model/Pulse :alert_condition nil))

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
  "The number of Collections matching the Honey SQL `where` clause."
  [where]
  (t2/count :model/Collection {:where where}))

(defn card-collection-ids
  "The Collection id and schema of the Cards matching the Honey SQL `where` clause."
  [where]
  (t2/select [:model/Card :collection_id :card_schema] {:where where}))

(defn database-stats-columns
  "The sync, engine, and DBMS version of the Databases matching the Honey SQL `where` clause."
  [where]
  (t2/select [:model/Database :is_full_sync :engine :dbms_version] {:where where}))

(defn table-database-and-schema
  "The Database id and schema of the Tables whose Database (aliased `d`) matches the Honey SQL `where` clause."
  [where]
  (t2/query {:select [:t.db_id :t.schema]
             :from   [[(t2/table-name :model/Table) :t]]
             :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where  where}))

(defn field-table-ids
  "The Table id of the Fields whose Database (aliased `d`) matches the Honey SQL `where` clause."
  [where]
  (t2/query {:select [:f.table_id]
             :from [[(t2/table-name :model/Field) :f]]
             :join [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]
                    [(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where where}))

(defn segment-count
  "The number of Segments."
  []
  (t2/count :model/Segment))

(defn unarchived-metric-card-count
  "The number of unarchived metric Cards."
  []
  (t2/count :model/Card :type :metric :archived false))

(defn rows
  "The rows returned by the Honey SQL or raw SQL `query`."
  [query]
  (t2/query query))

(defn query-cache-stats
  "The average result `:length` and `:count` of the QueryCache entries."
  []
  (t2/select-one [:model/QueryCache [[:avg [:length :results]] :length] [:%count.* :count]]))

(defn user-count-joined-before
  "The number (up to `limit`) of Users who joined at or before `joined-before` also matching the Honey SQL
  `where-clause`."
  [joined-before where-clause limit]
  (t2/count :model/User {:where [:and
                                 [:<= :date_joined joined-before]
                                 where-clause]
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
