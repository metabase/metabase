(ns metabase-enterprise.metabot-v3.tools.analyze-chart
  "Tool for computing statistics and generating context for chart analysis."
  (:require
   [metabase-enterprise.metabot-v3.stats.core :as stats.core]
   [metabase-enterprise.metabot-v3.stats.repr :as stats.repr]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]))

(set! *warn-on-reflection* true)

(defn- filter-timeline-events
  "Filter timeline events to those within the chart's time range.
  Returns nil if no series data or no events."
  [timeline-events series-data]
  (when (and (seq timeline-events) (seq series-data))
    ;; For now, return all events - filtering by date range can be added later
    ;; when we have proper date parsing for the x_values
    timeline-events))

(defn analyze-chart
  "Compute statistics and generate context for chart analysis.

  Receives chart_config from ai-service containing:
    - series: map of series-name -> {x, y, x_values, y_values, ...}
    - timeline_events: optional relevant events
    - display_type: optional explicit chart type
    - title: optional chart title

  Returns {:output markdown-string} for LLM consumption."
  [{:keys [chart-config deep]}]
  (try
    (let [{:keys [series timeline_events title display_type]} chart-config
          opts {:deep? (boolean deep)}
          stats (stats.core/compute-chart-stats chart-config opts)
          filtered-events (filter-timeline-events timeline_events series)
          context {:title title
                   :display-type display_type
                   :stats stats
                   :timeline-events filtered-events}
          representation (stats.repr/generate-representation context)]
      {:output representation})
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))
