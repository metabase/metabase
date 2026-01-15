(ns metabase-enterprise.metabot-v3.agent.profiles
  "Profile configurations for different metabot use cases.
  Each profile defines model settings, iteration limits, and available tools.")

(def profiles
  "Map of profile-id to profile configuration."
  {:metabot-embedding
   {:model "claude-sonnet-4-5-20250929"
    :max-iterations 6
    :temperature 0.3
    :tools ["search"
            "query_metric"
            "query_model"
            "get_field_values"
            "show_results_to_user"]}

   :metabot-internal
   {:model "claude-sonnet-4-5-20250929"
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
            "invite_user"]}

   :metabot-transforms-codegen
   {:model "claude-sonnet-4-5-20250929"
    :max-iterations 30
    :temperature 0.3
    :tools ["search"
            "get_transform_details"
            "get_entity_details"
            "get_field_stats"]}})

(defn get-profile
  "Get profile configuration by profile-id keyword."
  [profile-id]
  (get profiles profile-id))
