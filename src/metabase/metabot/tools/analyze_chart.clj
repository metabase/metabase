(ns metabase.metabot.tools.analyze-chart
  "Native agent tool for chart statistics analysis.

  Analyzes charts from viewing context. The frontend provides pre-materialized
  series data in chart_configs, which is seeded into agent memory during
  initialization. This avoids re-executing queries."
  (:require
   [clojure.string :as str]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.quoting :as quoting]
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

(def ^:private max-quoted-chars
  "Errors repeat at most this many characters of a chart config ID or a series name.
  Either can be any length, and quoting can turn one character into six, so this leaves room for the recovery steps
  within the runtime's limit on failure text."
  100)

(def ^:private max-listed-ids-chars
  "The not-found error lists available chart config IDs in at most this many characters."
  1000)

(defn- quoted-excerpt
  "Quote `s`, cut to [[max-quoted-chars]] characters."
  [s]
  (quoting/quoted (llm-shape/truncate s max-quoted-chars)))

(defn- listed-ids
  "Quote `ids` and join them with commas. IDs that don't fit in [[max-listed-ids-chars]] are counted, not listed."
  [ids]
  (let [quoted (map quoted-excerpt ids)
        shown  (count (take-while #(<= % max-listed-ids-chars)
                                  (reductions + (map #(+ 2 (count %)) quoted))))]
    (str (str/join ", " (take shown quoted))
         (when (< shown (count ids))
           (str " and " (- (count ids) shown) " more")))))

(defn- read-values-steps
  "Return the steps that read the chart's values with `run_query` instead.
  `sql-only-run-query?` says whether the profile's `run_query` runs SQL only and so takes no saved question's ID."
  [sql-only-run-query?]
  (if sql-only-run-query?
    [{:uses #{"run_query"}
      :text (str "To read the chart's values instead, call `run_query` with the ID of the unsaved SQL query that the"
                 " user is viewing.")}
     {:uses #{"create_sql_query" "run_query"}
      :text (str "For a saved question, write SQL that reads it with `create_sql_query`, then run that query with"
                 " `run_query`.")}]
    [{:uses #{"run_query"}
      :text (str "To read the chart's values instead, call `run_query` with the ID of the query or question that the"
                 " user is viewing.")}]))

(tools/defrecoverable chart-config-not-found!
  "No chart config from the user's viewing context has the requested ID."
  {:payload [:map {:closed true}
             [:chart-config-id :string]
             [:available       [:sequential :string]]]
   :quoted  {:chart-config-id quoted-excerpt}}
  [{:keys [chart-config-id available]}]
  {:message  (str "Chart config " (quoted-excerpt chart-config-id) " was not found"
                  (if (seq available)
                    (str ". Available chart config IDs: " (listed-ids available) ".")
                    ", and the user's current view has no chart to analyze.")
                  " Charts that you created can't be analyzed.")
   :recovery [(if (seq available)
                {:uses #{} :text "Retry with one of the available chart config IDs."}
                {:uses #{} :text "Don't call this tool again in this turn."})
              {:uses #{"run_query"}
               :text "To read the values of a query that you built, call `run_query` with its query ID."}]})

(tools/defrecoverable no-series-data!
  "No series of the chart config has a point with both an x and a y value."
  {:payload [:map {:closed true} [:sql-only-run-query? :boolean]]}
  [{:keys [sql-only-run-query?]}]
  {:message  "This chart has no series data to analyze."
   :recovery (conj (read-values-steps sql-only-run-query?)
                   {:uses #{}
                    :text "If you can't read the chart's values, tell the user that this chart can't be analyzed."})})

(tools/defrecoverable non-numeric-series!
  "A series of the chart config has a y-value that is not a number."
  {:payload [:map {:closed true}
             [:series              :string]
             [:sql-only-run-query? :boolean]]
   :quoted  {:series quoted-excerpt}}
  [{:keys [series sql-only-run-query?]}]
  {:message  (str "Series " (quoted-excerpt series) " has non-numeric y-values. Chart analysis "
                  "requires a numeric y-axis metric.")
   :recovery (conj (read-values-steps sql-only-run-query?)
                   {:uses #{}
                    :text (str "If you can't read the chart's values, tell the user that this chart can't be analyzed"
                               " because its y-axis values aren't numbers.")})})

(defn- stringify-series-keys
  "Ensure series map keys are strings, not keywords.
  JSON parsing keywordizes all keys, but series names (e.g. \"Revenue by Region\") should be strings."
  [chart-config]
  (if-let [series (:series chart-config)]
    (assoc chart-config :series (update-keys series name))
    chart-config))

(defn- resolve-chart-config-from-memory
  "Resolve a chart-config-id from agent memory into chart configuration, or throw [[chart-config-not-found!]].
  Chart configs are seeded from viewing context during agent initialization."
  [chart-config-id]
  (let [chart-configs (shared/current-chart-configs-state)]
    (if-let [chart-config (get chart-configs chart-config-id)]
      (stringify-series-keys chart-config)
      (chart-config-not-found! {:chart-config-id chart-config-id
                                :available       (sort (keys chart-configs))}))))

(defn- non-numeric-y-value?
  "True when `y-values` contains a non-nil value that is not a number.
  nil y-values are allowed; they are treated as missing data points downstream."
  [y-values]
  (boolean (some (fn [v] (and (some? v) (not (number? v)))) y-values)))

(defn- validate-chart-config!
  "Throw a recoverable error when `chart-config` is too malformed to analyze.
  `sql-only-run-query?` picks the recovery steps, as in [[read-values-steps]]."
  [{:keys [series] :as chart-config} sql-only-run-query?]
  (when (empty? (interestingness/analyzable-series chart-config))
    (no-series-data! {:sql-only-run-query? sql-only-run-query?}))
  (doseq [[series-name {:keys [y_values]}] series]
    (when (non-numeric-y-value? y_values)
      ;; compute-chart-stats assumes each series has numeric y-values.
      (non-numeric-series! {:series series-name :sql-only-run-query? sql-only-run-query?}))))

(defrecord AnalyzeChartTool [sql-only-run-query?]
  tools/Tool
  (declaration [_]
    {:name        "analyze_chart"
     :description (str "Compute statistics and generate analysis context for a chart.\n"
                       "Use this to analyze trends, outliers, volatility, and patterns in chart data.\n\n"
                       "The chart_config_id references a chart from the user's current viewing context.\n"
                       "Available chart IDs are provided in the system context.")
     :scope       scope/agent-viz-read
     :args        [:map {:closed true}
                   [:chart_config_id :string]
                   [:deep {:optional true :default true} [:maybe :boolean]]]})

  (handle [_ {:keys [chart_config_id deep]} _ctx]
    (let [chart-config (resolve-chart-config-from-memory chart_config_id)]
      (validate-chart-config! chart-config sql-only-run-query?)
      ;; Wrap TMD operations in resource context to ensure off-heap memory is released
      (resource/stack-resource-context
       (let [{:keys [timeline_events title display_type]} chart-config
             opts  {:deep? (if (nil? deep) true (boolean deep))}
             stats (interestingness/compute-chart-stats (select-keys chart-config [:series :display_type]) opts)
             context {:title           title
                      :display-type    display_type
                      :stats           stats
                      :timeline-events timeline_events}
             representation (interestingness/generate-representation context)]
         {:output (str representation "\n\n---\n\n" interpretation-guidance)})))))

(def analyze-chart-tool
  "The `analyze_chart` tool for profiles whose `run_query` runs a saved question by its own ID."
  (->AnalyzeChartTool false))

(def analyze-chart-sql-tool
  "The `analyze_chart` tool for the eval-only `internal-sql` profile, whose `run_query` runs SQL only."
  (->AnalyzeChartTool true))
