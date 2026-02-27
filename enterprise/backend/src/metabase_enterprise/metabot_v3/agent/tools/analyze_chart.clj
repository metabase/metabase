(ns metabase-enterprise.metabot-v3.agent.tools.analyze-chart
  "Native agent tool for chart statistics analysis.

  Analyzes charts from viewing context. The frontend provides pre-materialized
  series data in chart_configs, which is seeded into agent memory during
  initialization. This avoids re-executing queries."
  (:require
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.stats.core :as stats.core]
   [metabase-enterprise.metabot-v3.stats.repr :as stats.repr]
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

(defn- resolve-chart-config-from-memory
  "Resolve a chart-config-id from agent memory into chart configuration.
  Chart configs are seeded from viewing context during agent initialization."
  [chart-config-id]
  (get (shared/current-chart-configs-state) chart-config-id))

(mu/defn ^{:tool-name "analyze_chart"
           :prompt "analyze_chart"}
  analyze-chart-tool
  "Compute statistics and generate analysis context for a chart.
  Use this to analyze trends, outliers, volatility, and patterns in chart data.

  The chart_config_id references a chart from the user's current viewing context.
  Available chart IDs are provided in the system context."
  [{:keys [chart_config_id deep]}
   :- [:map {:closed true}
       [:chart_config_id :string]
       [:deep {:optional true :default true} [:maybe :boolean]]]]
  (try
    (if-let [chart-config (resolve-chart-config-from-memory chart_config_id)]
      ;; Wrap TMD operations in resource context to ensure off-heap memory is released
      (resource/stack-resource-context
       (let [{:keys [timeline_events title display_type]} chart-config
             opts  {:deep? (if (nil? deep) true (boolean deep))}
             stats (stats.core/compute-chart-stats chart-config opts)
             context {:title           title
                      :display-type    display_type
                      :stats           stats
                      :timeline-events timeline_events}
             representation (stats.repr/generate-representation context)]
         {:output (str representation "\n\n---\n\n" interpretation-guidance)}))
      {:output (str "Chart config not found: " chart_config_id
                    ". Available chart configs can be found in the viewing context.")})
    (catch Exception e
      (log/error e "Error analyzing chart")
      {:output (str "Failed to analyze chart: " (or (ex-message e) "Unknown error"))})))
