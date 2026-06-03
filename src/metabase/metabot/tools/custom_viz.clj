(ns metabase.metabot.tools.custom-viz
  "Custom visualization tool definitions."
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(def ^:private built-in-visualization-types
  [{:chart-type "table"
    :name       "Table"
    :description "Exact row-level values or detailed lists where users need to inspect records."
    :data-shape "Any tabular result."}
   {:chart-type "bar"
    :name       "Bar chart"
    :description "Compare values across categories, especially when category labels are short."
    :data-shape "One category column and one or more numeric measures."}
   {:chart-type "row"
    :name       "Row chart"
    :description "Compare values across categories with long labels or many categories."
    :data-shape "One category column and one or more numeric measures."}
   {:chart-type "line"
    :name       "Line chart"
    :description "Show time trends and changes over an ordered sequence."
    :data-shape "Temporal or ordered breakout plus one or more numeric measures."}
   {:chart-type "area"
    :name       "Area chart"
    :description "Show cumulative-looking trends or part-to-whole trends over time."
    :data-shape "Temporal breakout plus one or more numeric measures."}
   {:chart-type "combo"
    :name       "Combo chart"
    :description "Combine bars and lines when measures have different roles or scales."
    :data-shape "Category/time breakout plus multiple numeric measures."}
   {:chart-type "scatter"
    :name       "Scatter plot"
    :description "Explore relationships, clusters, and outliers between numeric variables."
    :data-shape "Two numeric columns, optionally with category/size fields."}
   {:chart-type "pie"
    :name       "Pie chart"
    :description "Show simple part-to-whole composition for a small number of categories."
    :data-shape "One category column and one numeric measure; best with few slices."}
   {:chart-type "sunburst"
    :name       "Sunburst chart"
    :description "Show hierarchical part-to-whole composition across nested categories."
    :data-shape "Multiple categorical levels plus one numeric measure."}
   {:chart-type "pivot"
    :name       "Pivot table"
    :description "Cross-tab exact values by rows and columns."
    :data-shape "At least two dimensions and one numeric measure."}
   {:chart-type "waterfall"
    :name       "Waterfall chart"
    :description "Show sequential positive and negative contributions to a total."
    :data-shape "Ordered category/step column plus numeric deltas."}
   {:chart-type "sankey"
    :name       "Sankey chart"
    :description "Show flow volume between stages or categories."
    :data-shape "Source category, target category, and numeric weight."}
   {:chart-type "scalar"
    :name       "Scalar"
    :description "Display a single headline KPI value."
    :data-shape "One numeric result or aggregated metric."}
   {:chart-type "smartscalar"
    :name       "Trend scalar"
    :description "Display a KPI with trend/comparison context."
    :data-shape "Aggregated metric with comparison or time context."}
   {:chart-type "gauge"
    :name       "Gauge"
    :description "Show progress toward a target or threshold."
    :data-shape "One numeric measure with min/max or target context."}
   {:chart-type "progress"
    :name       "Progress bar"
    :description "Show completion toward a goal in a compact linear form."
    :data-shape "One numeric measure with target context."}
   {:chart-type "funnel"
    :name       "Funnel"
    :description "Show ordered conversion/drop-off through stages."
    :data-shape "Ordered stage column plus numeric count/measure."}
   {:chart-type "object"
    :name       "Object detail"
    :description "Show one record as a detail view."
    :data-shape "A single row or record-like result."}
   {:chart-type "map"
    :name       "Map"
    :description "Show geographic values or points."
    :data-shape "Location/region or latitude/longitude fields, optionally with a numeric measure."}])

(defn built-in-types
  "Built-in visualization types that can be rendered with `create_chart`."
  []
  built-in-visualization-types)

(defn- format-visualization-type
  [{:keys [source chart-type identifier name description data-shape]}]
  (case source
    :custom
    (str "- " name " (`identifier: \"" identifier "\"`, display `custom:" identifier "`): " description)

    (str "- " name " (`chart_type: \"" chart-type "\"`): " description " Data shape: " data-shape)))

(defn format-visualization-types-output
  [{:keys [built-in custom]}]
  (str/join
   "\n"
   (concat
    ["Available visualization types"
     ""
     "Built-in Metabase visualizations (use `create_chart` or `construct_notebook_query` with `visualization.chart_type`):"]
    (map format-visualization-type built-in)
    [""
     "Reusable custom visualizations (reuse with `create_custom_visualization` by passing `query_id` and `identifier`, without `factory_js`):"]
    (if (seq custom)
      (map format-visualization-type custom)
      ["- None yet."])
    [""
     "Instructions: prefer a built-in visualization when it fits. If a listed custom visualization matches the user's requested reusable pattern, reuse it by identifier. Only create or update a custom visualization when neither the built-in list nor the existing custom list fits."])))

(defenterprise ^{:tool-name "list_visualization_types"
                 :schema    [:=> [:cat [:map {:closed true}]] :map]
                 :scope     scope/agent-viz-read}
  list-visualization-types-tool
  "List built-in and reusable custom visualization types available to the agent."
  metabase-enterprise.metabot.tools.custom-viz
  [_args]
  (let [built-in (built-in-types)]
    {:output (format-visualization-types-output {:built-in built-in :custom []})
     :structured-output {:built-in-visualizations built-in
                         :custom-visualizations   []}}))

(def create-custom-visualization-schema
  "Malli schema for the arguments to the create_custom_visualization tool."
  [:map {:closed true}
   [:query_id
    {:description "The query id whose results should be rendered with this reusable custom visualization."}
    :string]
   [:display_name
    {:optional true
     :description (str "Human-readable reusable visualization type name shown in Metabase. Required when creating "
                       "or updating with factory_js; omit when reusing an existing identifier. Examples: "
                       "\"Star Rating Bars\" or \"Month Navigator\", not dataset-specific names like "
                       "\"Orders by Month\" or \"Reviews by Rating\".")}
    [:maybe :string]]
   [:identifier
    {:optional true
     :description (str "Optional stable slug for the plugin. Use lowercase letters, numbers, and hyphens. "
                       "Base it on the generic visualization pattern, not table names, metrics, or date ranges. Pass "
                       "an existing identifier from list_visualization_types to reuse that visualization without factory_js. "
                       "If creating and omitted, Metabase will derive one from display_name.")}
    [:maybe :string]]
   [:description
    {:optional true
     :description (str "Required when creating or updating with factory_js. Short reusable description of the "
                       "visualization behavior, interactions, and expected data shape so future Metabot turns can "
                       "decide whether to reuse it.")}
    [:maybe :string]]
   [:factory_js
    {:optional true
     :description (str "A JavaScript expression that evaluates to a custom-viz factory function. "
                       "No imports, exports, React, JSX, or npm packages — plain DOM only. The function "
                       "receives exactly { defineSetting, locale } (there is no getAssetUrl) and returns "
                       "{ id, getName, checkRenderable, settings, mount }. The mount function receives "
                       "(container, props) where props is { width, height, series, settings, colorScheme, "
                       "onClick, onHover }, renders with plain DOM APIs, and returns { update, unmount }. "
                       "Read data from props.series[0].data.cols and .rows. Implement a generic visualization "
                       "that reads column metadata and props.settings instead of hardcoding dataset-specific "
                       "field names or labels. It is run through the full lifecycle on the server and rejected "
                       "with the JS error if it is malformed. Omit factory_js only when reusing an existing custom "
                       "visualization by identifier.")}
    [:maybe :string]]
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
  "Create, update, or reuse a custom visualization plugin and render a query with it."
  metabase-enterprise.metabot.tools.custom-viz
  [_args]
  {:output "Custom visualization tools are only available in Metabase Enterprise Edition."})
