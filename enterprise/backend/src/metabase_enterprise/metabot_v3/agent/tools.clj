(ns metabase-enterprise.metabot-v3.agent.tools
  "Tool registry for the agent loop.
  Bridges existing deftool handlers to mu/defn format for tool-executor-rff."
  (:require
   [metabase-enterprise.metabot-v3.agent.profiles :as profiles]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as create-subscription-tools]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query-tools]
   [metabase-enterprise.metabot-v3.tools.edit-sql-query :as edit-sql-query-tools]
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details-tools]
   [metabase-enterprise.metabot-v3.tools.field-stats :as field-stats-tools]
   [metabase-enterprise.metabot-v3.tools.filters :as filter-tools]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as outliers-tools]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as insights-tools]
   [metabase-enterprise.metabot-v3.tools.invite-user :as invite-user-tools]
   [metabase-enterprise.metabot-v3.tools.replace-sql-query :as replace-sql-query-tools]
   [metabase-enterprise.metabot-v3.tools.search :as search-tools]
   [metabase-enterprise.metabot-v3.tools.show-results-to-user :as show-results-tools]
   [metabase-enterprise.metabot-v3.tools.sql-search :as sql-search-tools]
   [metabase-enterprise.metabot-v3.tools.transforms :as transform-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;; Tool wrapper pattern: Create mu/defn wrappers that call existing tool implementations
;; The tool-executor-rff expects vars with Malli schemas in the metadata
;; Each wrapper takes snake_case parameters from LLM and calls the kebab-case tool handler

;;; Search & Discovery Tools

(mu/defn search-tool
  "Search for tables, models, metrics, and saved questions in the Metabase instance."
  [{:keys [term_queries entity_types limit]} :- [:map {:closed true}
                                                 [:term_queries {:optional true}
                                                  [:maybe [:sequential [:string {:description "Search term queries"}]]]]
                                                 [:entity_types {:optional true}
                                                  [:maybe [:sequential [:enum "table" "model" "question" "metric" "dashboard" "database" "transform"]]]]
                                                 [:limit {:optional true} [:maybe [:int {:min 1 :max 100}]]]]]
  (search-tools/search-tool {:term-queries term_queries
                             :entity-types entity_types
                             :limit (or limit 10)}))

;;; Query Construction Tools

(mu/defn query-metric-tool
  "Construct a query from a metric."
  [{:keys [metric_id filters group_by]} :- [:map {:closed true}
                                            [:metric_id :int]
                                            [:filters {:optional true} [:maybe [:sequential :map]]]
                                            [:group_by {:optional true} [:maybe [:sequential :map]]]]]
  (filter-tools/query-metric {:metric-id metric_id
                              :filters filters
                              :group-by group_by}))

(mu/defn query-model-tool
  "Construct a query from a model."
  [{:keys [model_id fields filters aggregations group_by order_by limit]}
   :- [:map {:closed true}
       [:model_id :int]
       [:fields {:optional true} [:maybe [:sequential :map]]]
       [:filters {:optional true} [:maybe [:sequential :map]]]
       [:aggregations {:optional true} [:maybe [:sequential :map]]]
       [:group_by {:optional true} [:maybe [:sequential :map]]]
       [:order_by {:optional true} [:maybe [:sequential :map]]]
       [:limit {:optional true} [:maybe :int]]]]
  (filter-tools/query-model {:model-id model_id
                             :fields fields
                             :filters filters
                             :aggregations aggregations
                             :group-by group_by
                             :order-by order_by
                             :limit limit}))

;;; Metadata & Details Tools

(mu/defn get-field-values-tool
  "Return statistics and/or values for a given field of a given entity."
  [{:keys [entity_type entity_id field_id limit]} :- [:map {:closed true}
                                                      [:entity_type [:enum "table" "model" "metric"]]
                                                      [:entity_id :int]
                                                      [:field_id :string]
                                                      [:limit {:optional true} [:maybe :int]]]]
  (field-stats-tools/field-values {:entity-type entity_type
                                   :entity-id entity_id
                                   :field-id field_id
                                   :limit limit}))

(mu/defn get-entity-details-tool
  "Get information about a given table or model."
  [{:keys [table_id model_id with_fields with_field_values with_related_tables
           with_metrics with_metric_default_temporal_breakout with_measures with_segments]}
   :- [:map {:closed true}
       [:table_id {:optional true} [:or :int :string]]
       [:model_id {:optional true} :int]
       [:with_fields {:optional true} [:maybe :boolean]]
       [:with_field_values {:optional true} [:maybe :boolean]]
       [:with_related_tables {:optional true} [:maybe :boolean]]
       [:with_metrics {:optional true} [:maybe :boolean]]
       [:with_metric_default_temporal_breakout {:optional true} [:maybe :boolean]]
       [:with_measures {:optional true} [:maybe :boolean]]
       [:with_segments {:optional true} [:maybe :boolean]]]]
  (entity-details-tools/get-table-details
   {:table-id table_id
    :model-id model_id
    :with-fields? with_fields
    :with-field-values? with_field_values
    :with-related-tables? with_related_tables
    :with-metrics? with_metrics
    :with-default-temporal-breakout? with_metric_default_temporal_breakout
    :with-measures? with_measures
    :with-segments? with_segments}))

(mu/defn get-metric-details-tool
  "Get information about a given metric."
  [{:keys [metric_id with_default_temporal_breakout with_field_values
           with_queryable_dimensions with_segments]}
   :- [:map {:closed true}
       [:metric_id :int]
       [:with_default_temporal_breakout {:optional true} [:maybe :boolean]]
       [:with_field_values {:optional true} [:maybe :boolean]]
       [:with_queryable_dimensions {:optional true} [:maybe :boolean]]
       [:with_segments {:optional true} [:maybe :boolean]]]]
  (entity-details-tools/get-metric-details
   {:metric-id metric_id
    :with-default-temporal-breakout? with_default_temporal_breakout
    :with-field-values? with_field_values
    :with-queryable-dimensions? with_queryable_dimensions
    :with-segments? with_segments}))

(mu/defn get-field-stats-tool
  "Get statistics for a field."
  [{:keys [entity_type entity_id field_id]}
   :- [:map {:closed true}
       [:entity_type [:enum "table" "model" "metric"]]
       [:entity_id :int]
       [:field_id :string]]]
  (field-stats-tools/field-values {:entity-type entity_type
                                   :entity-id entity_id
                                   :field-id field_id}))

;;; Visualization & Results Tools

(mu/defn show-results-to-user-tool
  "Show query results to the user."
  [{:keys [query]} :- [:map {:closed true}
                       [:query :map]]]
  (show-results-tools/show-results-to-user {:query query}))

;;; Analytics Tools

(mu/defn find-outliers-tool
  "Find outliers in the values provided by a data source for a given column."
  [{:keys [data_source]} :- [:map {:closed true}
                             [:data_source :map]]]
  (outliers-tools/find-outliers {:data-source data_source}))

(mu/defn generate-insights-tool
  "Generate insights for a given entity."
  [{:keys [for]} :- [:map {:closed true}
                     [:for :map]]]
  (insights-tools/generate-insights {:for for}))

;;; Action Tools

(mu/defn create-dashboard-subscription-tool
  "Create a dashboard subscription."
  [{:keys [dashboard_id email schedule]} :- [:map {:closed true}
                                             [:dashboard_id :int]
                                             [:email :string]
                                             [:schedule :map]]]
  (create-subscription-tools/create-dashboard-subscription
   {:dashboard-id dashboard_id
    :email email
    :schedule schedule}))

;;; Transform Tools

(mu/defn get-transform-details-tool
  "Get information about a transform."
  [{:keys [transform_id]} :- [:map {:closed true}
                              [:transform_id :int]]]
  (transform-tools/get-transform-details {:transform-id transform_id}))

;;; User Management Tools

(mu/defn invite-user-tool
  "Send a Metabase invitation to an email address."
  [{:keys [email]} :- [:map {:closed true}
                       [:email :string]]]
  (invite-user-tools/invite-user {:email email}))

;;; SQL Query Tools

(mu/defn create-sql-query-tool
  "Create a new SQL query."
  [{:keys [database_id sql name description collection_id]}
   :- [:map {:closed true}
       [:database_id :int]
       [:sql :string]
       [:name {:optional true} [:maybe :string]]
       [:description {:optional true} [:maybe :string]]
       [:collection_id {:optional true} [:maybe :int]]]]
  (create-sql-query-tools/create-sql-query-tool
   {:database-id database_id
    :sql sql
    :name name
    :description description
    :collection-id collection_id}))

(mu/defn edit-sql-query-tool
  "Edit an existing SQL query using structured edits."
  [{:keys [query_id edit name description]}
   :- [:map {:closed true}
       [:query_id :int]
       [:edit :map]
       [:name {:optional true} [:maybe :string]]
       [:description {:optional true} [:maybe :string]]]]
  (edit-sql-query-tools/edit-sql-query-tool
   {:query-id query_id
    :edit edit
    :name name
    :description description}))

(mu/defn replace-sql-query-tool
  "Replace the SQL content of an existing query entirely."
  [{:keys [query_id sql name description]}
   :- [:map {:closed true}
       [:query_id :int]
       [:sql :string]
       [:name {:optional true} [:maybe :string]]
       [:description {:optional true} [:maybe :string]]]]
  (replace-sql-query-tools/replace-sql-query-tool
   {:query-id query_id
    :sql sql
    :name name
    :description description}))

(mu/defn sql-search-tool
  "Search for SQL queries by content."
  [{:keys [query database_id limit]}
   :- [:map {:closed true}
       [:query :string]
       [:database_id {:optional true} [:maybe :int]]
       [:limit {:optional true} [:maybe [:int {:min 1 :max 50}]]]]]
  (sql-search-tools/sql-search-tool
   {:query query
    :database-id database_id
    :limit limit}))

;; Tool registry - maps tool name to var
(def all-tools
  "Registry of all available tools."
  {"search"                        #'search-tool
   "query_metric"                  #'query-metric-tool
   "query_model"                   #'query-model-tool
   "get_field_values"              #'get-field-values-tool
   "get_entity_details"            #'get-entity-details-tool
   "get_metric_details"            #'get-metric-details-tool
   "get_field_stats"               #'get-field-stats-tool
   "show_results_to_user"          #'show-results-to-user-tool
   "find_outliers"                 #'find-outliers-tool
   "generate_insights"             #'generate-insights-tool
   "create_dashboard_subscription" #'create-dashboard-subscription-tool
   "get_transform_details"         #'get-transform-details-tool
   "invite_user"                   #'invite-user-tool
   "create_sql_query"              #'create-sql-query-tool
   "edit_sql_query"                #'edit-sql-query-tool
   "replace_sql_query"             #'replace-sql-query-tool
   "sql_search"                    #'sql-search-tool})

(defn filter-by-capabilities
  "Filter tool names by user capabilities.
  For now, all tools are available to all users with metabot access."
  [tool-names _capabilities]
  tool-names)

(defn get-tools-for-profile
  "Get tool registry filtered by profile configuration and user capabilities."
  [profile-id capabilities]
  (let [profile (profiles/get-profile profile-id)
        tool-names (or (:tools profile) [])]
    (select-keys all-tools (filter-by-capabilities tool-names capabilities))))
