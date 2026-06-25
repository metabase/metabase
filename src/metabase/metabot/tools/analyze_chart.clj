(ns metabase.metabot.tools.analyze-chart
  "Native agent tool for chart statistics analysis.

  Analyzes charts from viewing context. The frontend provides pre-materialized
  series data in chart_configs, which is seeded into agent memory during
  initialization. This avoids re-executing queries."
  (:require
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.shared :as shared]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [tech.v3.resource :as resource]))

(set! *warn-on-reflection* true)

(def ^:private interpretation-guidance
  "Tell users what the data MEANS. They can see the chart.

**[Insight]**: [1-2 sentences with **bold numbers**]. [What to do about it.]

RULES:
- Lead with the single most important finding
- One supporting bullet only if critical
- 2-3 sentences for routine patterns; expand only for genuine surprises
- If nothing notable, say so briefly and stop
- Connect timeline events to data changes only if the effect is visible
- If you see a **Note** about small values, high variance, or limited data, be cautious.
  The chart visual is the source of truth.

GOOD: \"Revenue dropped **42%** after the pricing change — investigate Q4 deals.\"
GOOD: \"Data fluctuates with no clear trend. Small values make percentages unreliable.\"
BAD: \"The mean is 45.2 with std dev 12.8. The trend shows -15% overall change...\"

Do not use headers (##). Do not list statistics. Do not analyze series separately.")

(defn- stringify-series-keys
  "Ensure series map keys are strings, not keywords.
  JSON parsing keywordizes all keys, but series names (e.g. \"Revenue by Region\") should be strings."
  [chart-config]
  (if-let [series (:series chart-config)]
    (assoc chart-config :series (update-keys series name))
    chart-config))

(defn- resolve-chart-config-from-memory
  "Resolve a chart-config-id from agent memory into chart configuration.
  Chart configs are seeded from viewing context during agent initialization."
  [chart-config-id]
  (some-> (get (shared/current-chart-configs-state) chart-config-id)
          stringify-series-keys))

(defn- non-numeric-y-value?
  "True when `y-values` contains a non-nil value that is not a number.
  nil y-values are allowed; they are treated as missing data points downstream."
  [y-values]
  (boolean (some (fn [v] (and (some? v) (not (number? v)))) y-values)))

(defn- validate-chart-config!
  "Throw an informative exception when `chart-config` is too malformed to analyze."
  [{:keys [series] :as _chart-config}]
  (when (empty? series)
    (throw (ex-info "This chart has no series data to analyze."
                    {:type ::malformed-chart-config})))
  (doseq [[series-name {:keys [y_values]}] series]
    (when (empty? y_values)
      (throw (ex-info (format "Series \"%s\" has no data points to analyze." series-name)
                      {:type ::malformed-chart-config, :series series-name})))
    (when (non-numeric-y-value? y_values)
      ;; compute-chart-stats assumes each series has numeric y-values.
      (throw (ex-info (format (str "Series \"%s\" has non-numeric y-values. Chart analysis "
                                   "requires a numeric y-axis metric.")
                              series-name)
                      {:type ::malformed-chart-config, :series series-name})))))

(mu/defn ^{:tool-name "analyze_chart"
           :prompt    "analyze_chart"
           :scope     scope/agent-viz-read}
  analyze-chart-tool
  "Compute statistics and generate analysis context for a chart.
  Use this to analyze trends, outliers, volatility, and patterns in chart data.

  The chart_config_id references a chart from the user's current viewing context.
  Available chart IDs are provided in the system context."
  [{:keys [chart_config_id deep]} :- [:map {:closed true}
                                      [:chart_config_id :string]
                                      [:deep {:optional true :default true} [:maybe :boolean]]]]
  (try
    (if-let [chart-config (resolve-chart-config-from-memory chart_config_id)]
      (do
        (validate-chart-config! chart-config)
        ;; Wrap TMD operations in resource context to ensure off-heap memory is released
        (resource/stack-resource-context
         (let [{:keys [timeline_events title display_type]} chart-config
               opts  {:deep? (if (nil? deep) true (boolean deep))}
               stats (interestingness/compute-chart-stats chart-config opts)
               context {:title           title
                        :display-type    display_type
                        :stats           stats
                        :timeline-events timeline_events}
               representation (interestingness/generate-representation context)]
           {:output (str representation "\n\n---\n\n" interpretation-guidance)})))
      {:output (str "Chart config not found: " chart_config_id
                    ". Available chart configs can be found in the viewing context.")})
    (catch Exception e
      (log/error e "Error analyzing chart")
      {:output (str "Failed to analyze chart: " (or (ex-message e) "Unknown error"))})))
