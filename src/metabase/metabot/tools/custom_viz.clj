(ns metabase.metabot.tools.custom-viz
  "Custom visualization tool definitions."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(def create-custom-visualization-schema
  "Malli schema for the arguments to the create_custom_visualization tool."
  [:map {:closed true}
   [:query_id
    {:description "The query id whose results should be rendered with this reusable custom visualization."}
    :string]
   [:display_name
    {:description (str "Human-readable reusable visualization type name shown in Metabase, e.g. "
                       "\"Star Rating Bars\" or \"Month Navigator\", not dataset-specific names like "
                       "\"Orders by Month\" or \"Reviews by Rating\".")}
    :string]
   [:identifier
    {:optional true
     :description (str "Optional stable slug for the plugin. Use lowercase letters, numbers, and hyphens. "
                       "Base it on the generic visualization pattern, not table names, metrics, or date ranges. "
                       "If omitted, Metabase will derive one from display_name.")}
    [:maybe :string]]
   [:description
    {:optional true
     :description "Optional short description of the reusable visualization behavior and expected data shape."}
    [:maybe :string]]
   [:factory_js
    {:description (str "A JavaScript expression that evaluates to a custom-viz factory function. "
                       "Do not use imports or exports. The function receives { defineSetting, getAssetUrl, locale } "
                       "and returns { id, getName, checkRenderable, settings, mount }. The mount function receives "
                       "(container, initialProps), renders with plain DOM APIs, and returns { update, unmount }. "
                       "Implement a generic visualization that reads column metadata, rows, and props.settings "
                       "instead of hardcoding dataset-specific field names or labels.")}
    :string]
   [:visualization_settings
    {:optional true
     :description (str "Initial visualization settings to store in the ad-hoc question URL and pass to the plugin "
                       "as props.settings. Put dataset-specific labels, thresholds, field role overrides, and units "
                       "here so the plugin can be reused with other queries.")}
    [:maybe [:map-of :any :any]]]])

(defenterprise ^{:tool-name "create_custom_visualization"
                 :schema    [:=> [:cat create-custom-visualization-schema] :map]
                 :scope     scope/agent-viz-create}
  create-custom-visualization-tool
  "Create or update a reusable custom visualization plugin and render a query with it."
  metabase-enterprise.metabot.tools.custom-viz
  [_args]
  {:output "Custom visualization tools are only available in Metabase Enterprise Edition."})
