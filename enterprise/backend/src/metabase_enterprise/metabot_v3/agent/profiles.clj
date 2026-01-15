(ns metabase-enterprise.metabot-v3.agent.profiles
  "Profile configurations for different metabot use cases.
  Each profile defines model settings, iteration limits, and available tools.")

(def profiles
  "Map of profile-id to profile configuration.

  Each profile includes:
  - :prompt-template - Selmer template name from resources/metabot/prompts/system/
  - :model - LLM model identifier
  - :max-iterations - Maximum agent loop iterations
  - :temperature - LLM temperature setting
  - :tools - Vector of tool names available to this profile"
  {:metabot-embedding
   {:prompt-template "embedding.selmer"
    :model "claude-sonnet-4-5-20250929"
    :max-iterations 6
    :temperature 0.3
    :tools ["search"
            "query_metric"
            "query_model"
            "get_field_values"
            "show_results_to_user"
            "read_resource"]}

   :metabot-internal
   {:prompt-template "internal.selmer"
    :model "claude-sonnet-4-5-20250929"
    :max-iterations 10
    :temperature 0.3
    :tools ["search"
            "query_metric"
            "query_model"
            "get_field_values"
            "get_entity_details"
            "get_metric_details"
            "get_field_stats"
            "show_results_to_user"
            "find_outliers"
            "generate_insights"
            "create_dashboard_subscription"
            "invite_user"
            "create_sql_query"
            "edit_sql_query"
            "replace_sql_query"
            "sql_search"
            "read_resource"]}

   :metabot-transforms-codegen
   {:prompt-template "transform-codegen.selmer"
    :model "claude-sonnet-4-5-20250929"
    :max-iterations 30
    :temperature 0.3
    :tools ["search"
            "get_transform_details"
            "get_entity_details"
            "get_field_stats"
            "read_resource"]}

   :metabot-sql-only
   {:prompt-template "sql-querying-only.selmer"
    :model "claude-sonnet-4-5-20250929"
    :max-iterations 8
    :temperature 0.3
    :tools ["search"
            "get_entity_details"
            "get_field_stats"
            "create_sql_query"
            "edit_sql_query"
            "replace_sql_query"
            "sql_search"
            "read_resource"]}})

(defn get-profile
  "Get profile configuration by profile-id keyword."
  [profile-id]
  (get profiles profile-id))
