(ns metabase.explorations.auto-insights.common
  "Shared infrastructure for the two-phase Automatic Insights pipeline.

  Holds *only* the helpers both phase-1 (curation) and phase-2 (analysis)
  actually depend on:

  - `format-errors` — used by both phases' repair-prompt builders.
  - `prep-chart` — turns a cached QP result + chart-stats into the rich
    per-chart record both phases consume (phase-1 for its index entry,
    phase-2 for its slim / full chart blocks). `chart-summary-line` (used
    inside prep-chart) shares two helpers with phase-2's key-points
    renderer: `key-points-from-stats` and `format-pct` are public so phase-2
    can call them directly.
  - `format-timeline-events` — renders the timeline-events Markdown section
    that gets folded into both phase prompts.
  - `call-llm` / `summarize-parts` / `run-with-repair` — the LLM call,
    streamed-trace summarization, and validate-+-one-repair-retry loop the
    phases share. The LLM model / temperature / max-tokens / thinking budget
    are NOT defined here — each phase brings its own `llm-config` map and
    passes it through `run-with-repair`.

  Phase-specific renderers (chart index entry, slim/full chart blocks,
  key-points / data-points blocks), per-thread data loading (timeline
  events, selection context, result rows), pool sizing, and chart ranking
  all live in the namespaces that actually use them (phase-1, phase-2, or
  the orchestrator)."
  (:require
   [clojure.string :as str]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.metabot.self :as metabot.self]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn format-errors
  "Join a vector of error strings into a bulleted block for embedding in repair
  prompts and log messages."
  [errors]
  (str/join "\n" (map #(str "- " %) errors)))

;;; ----- chart prep (used by both phases via the prep-chart record) -----

(defn- deserialize-result
  "Inverse of [[cache.impl/do-with-serialization]] for the runner's
  single-frame nippy+gzip blob."
  [^bytes result-bytes]
  (with-open [is (ByteArrayInputStream. result-bytes)]
    (cache.impl/with-reducible-deserialized-results [[qp-result _] is]
      qp-result)))

(defn format-pct
  "Format a percent value with one decimal place plus an explicit sign. Public
  because phase-2's key-points renderer uses it, and so does
  `chart-summary-line` here in common."
  [n]
  (if n
    (format "%+.1f%%" (double n))
    "n/a (zero base)"))

(defn- time-series-key-points
  "Build the per-series key-points map from a `chart-stats` blob's time-series
  entry. All values are pulled from the cached `chart_stats` — we no longer
  re-scan the y-array client-side. Returns nil when the series doesn't have
  the expected time-series shape."
  [series-stats]
  (when (and (:peak series-stats) (:trough series-stats))
    (let [{:keys [peak trough above-mean data-points summary trend]} series-stats]
      {:peak       [(:x peak) (:y peak)]
       :trough     [(:x trough) (:y trough)]
       :first      [(get-in series-stats [:time-range :start]) (:start-value trend)]
       :last       [(get-in series-stats [:time-range :end])   (:end-value trend)]
       :change-pct (:overall-change-pct trend)
       :mean       (:mean summary)
       :n          data-points
       :above-mean above-mean})))

(defn- categorical-key-points
  "Build the per-series key-points map from a `chart-stats` blob's categorical
  entry. Uses the existing `:top-categories` / `:bottom-categories` and the
  summary stats — no recomputation needed. Returns nil when the series
  doesn't have the expected categorical shape."
  [series-stats]
  (let [top    (first (:top-categories series-stats))
        bottom (or (last (:bottom-categories series-stats))
                   (last (:top-categories series-stats)))
        {:keys [data-points summary]} series-stats]
    (when (and top bottom)
      {:peak         [(:name top)    (:value top)]
       :trough       [(:name bottom) (:value bottom)]
       :mean         (:mean summary)
       :n            data-points
       :above-mean   nil
       :categorical? true})))

(defn key-points-from-stats
  "Pull key-points out of a `chart-stats` series entry. Dispatches on the
  series shape — time-series series carry `:peak`/`:trough` (added by
  [[metabase.interestingness.chart.time-series]]), categorical series carry
  `:top-categories`/`:bottom-categories`. Falls back to nil for shapes we
  don't render (histograms, scatter).

  Public because two callers consume it: `chart-summary-line` here in
  common (used by both phases via `prep-chart`), and phase-2's
  `render-key-points-section` (used only in the analyst prompt)."
  [chart-stats sname]
  (let [series-stats (get-in chart-stats [:series sname])]
    (or (time-series-key-points  series-stats)
        (categorical-key-points  series-stats))))

(defn- fmt-num
  "Compact numeric formatter for the one-line chart summary. Plain integers
  pass through; floats with no fractional part drop the `.0`; otherwise we
  keep up to 4 significant figures so the summary line stays short."
  [n]
  (cond
    (nil? n)         "n/a"
    (integer? n)     (str n)
    (and (number? n)
         (== n (Math/floor (double n)))) (str (long n))
    (number? n)      (let [d (double n)
                           a (Math/abs d)]
                       (cond
                         (zero? d)   "0"
                         (>= a 1000) (format "%.0f" d)
                         (>= a 1)    (format "%.2f" d)
                         :else       (format "%.4g" d)))
    :else            (str n)))

(defn- chart-summary-line
  "A ~80-char human-readable summary of a chart's *contents* (not just its
  axes), used in the Phase-1 chart index so the curator can pick on substance
  rather than just dimension names. Reads from the cached `chart-stats` so
  it shares the same numbers downstream renderers will show."
  [cfg chart-stats]
  (let [series-entries (seq (:series cfg))]
    (cond
      (not series-entries)
      "no series data"

      :else
      (let [[sname _] (first series-entries)
            kp (key-points-from-stats chart-stats sname)]
        (if-not kp
          (str (count (:x_values (val (first series-entries)))) " non-numeric points")
          (let [{:keys [peak trough first last change-pct n categorical?]} kp
                [px pv] peak
                [_ tv]  trough
                more-than-one? (> (count series-entries) 1)]
            (str n " points"
                 (when more-than-one?
                   (str " across " (count series-entries) " series"))
                 " (" sname ")"
                 (when-not categorical?
                   (let [[fx fv] first
                         [lx lv] last]
                     (str ", " fx " → " lx
                          ": " (fmt-num fv) " → " (fmt-num lv)
                          " (" (format-pct change-pct) ")")))
                 ", peak " (fmt-num pv) " at " px
                 (when (not= pv tv) (str ", trough " (fmt-num tv))))))))))

(defn- column-detail
  "A compact human-readable identifier for a single QP-result column. Includes
  the display name plus any temporal-bucket / binning so that the same logical
  column at different granularities (e.g. `Created At: Month` vs `Created At:
  Quarter`) is distinguishable in prompt text. Falls back to the raw column
  name when no display name is present."
  [col]
  (when (map? col)
    (let [name-or-display (or (:display_name col) (:name col) "(unknown column)")
          unit (or (:unit col)
                   (when (vector? (:field_ref col))
                     (let [opts (some #(when (map? %) %) (:field_ref col))]
                       (or (:temporal-unit opts) (get opts "temporal-unit")))))
          binning (when (vector? (:field_ref col))
                    (let [opts (some #(when (map? %) %) (:field_ref col))]
                      (or (:binning opts) (get opts "binning"))))
          joined? (or (:source_alias col)
                      (:fk_field_id col))
          unit-name (some-> unit name)
          unit-redundant? (and unit-name
                               (str/includes? (u/lower-case-en name-or-display)
                                              (u/lower-case-en unit-name)))]
      (cond-> name-or-display
        (and unit (not unit-redundant?)) (str ": " unit-name)
        binning (str " (binned)")
        (and joined?
             (not (str/includes? name-or-display "→"))
             (not (str/includes? name-or-display ":")))
        (str " [joined]")))))

(defn chart-rank-score
  "Sort key for a hydrated query: prefer the LLM-judged contextual score, fall
  back to the deterministic interestingness, then 0. Higher is better.
  Lives here (rather than in the orchestrator) because [[prep-chart]] stamps
  it onto the prepped record."
  [q]
  (or (:contextual_interestingness_score q)
      (:interestingness_score q)
      0.0))

(defn prep-chart
  "Compute the rich per-chart record both phases consume.

  Returns nil when the cached stats are missing (chart-config couldn't be
  built at execution time) or anything throws. The same prepped record is
  reused for the Phase-1 index entry, the slim Phase-2 awareness block, and
  the full Phase-2 top-tier block — only the rendering differs.

  Beyond `cfg` (used for stats / data-point rendering), we also capture
  `:dim-detail` and `:metric-detail` — short strings derived from the raw
  QP-result column metadata. The query's own `:name` (e.g. `Revenue by
  Created At`) is not always enough to distinguish charts: multiple queries
  can share that title but differ on temporal bucket, FK source, or
  aggregation type. These fields surface the disambiguating detail so the
  curator (and the analyst) can tell them apart."
  [query result-data chart-stats]
  (try
    (when (and result-data chart-stats)
      (let [qp-result (deserialize-result result-data)
            cols      (get-in qp-result [:data :cols])
            cfg       (explorations.interestingness/qp-result->chart-config query qp-result)]
        (when cfg
          (let [metric-idx (first (keep-indexed (fn [i c]
                                                  (when (some-> (or (:effective_type c) (:base_type c))
                                                                keyword (isa? :type/Number))
                                                    i))
                                                cols))
                dim-idx    (when metric-idx (- 1 metric-idx))
                dim-col    (when dim-idx (nth cols dim-idx nil))
                metric-col (when metric-idx (nth cols metric-idx nil))]
            {:exploration-query-id (:id query)
             :name                 (:name query)
             :score                (chart-rank-score query)
             :display-type         (:display_type cfg)
             :cfg                  cfg
             :stats                chart-stats
             :summary-line         (chart-summary-line cfg chart-stats)
             :dim-detail           (column-detail dim-col)
             :metric-detail        (column-detail metric-col)}))))
    (catch Throwable e
      (log/warnf e "Could not prep chart for ExplorationQuery %d" (:id query))
      nil)))

;;; ----- timeline events rendering (both phases include this section) -----

(defn format-timeline-events
  "Render the thread's timeline events as a Markdown section for inclusion in
  both the curation and analysis prompts. Returns nil when no timelines were
  selected; returns the section with `(none)` per-timeline when a timeline
  has no events. Events appear in chronological order so the model can scan
  the sequence against a chart's data points."
  [timelines]
  (when (seq timelines)
    (str "TIMELINE EVENTS:\n"
         "The user attached the following timelines to this exploration. Each event\n"
         "is something that happened in the business — a launch, an outage, a policy\n"
         "change, a marketing push — and is potentially causally connected to\n"
         "movements in the data. Treat alignment between an event's date and a\n"
         "data inflection point as a STRONG analytical signal worth surfacing.\n"
         "\n"
         (str/join
          "\n\n"
          (for [{:keys [timeline-name timeline-description events]} timelines]
            (str "**" timeline-name "**"
                 (when (and timeline-description (not (str/blank? timeline-description)))
                   (str " — " timeline-description))
                 "\n"
                 (if (seq events)
                   (str/join
                    "\n"
                    (for [{:keys [name description timestamp]} events]
                      (str "- " timestamp ": " name
                           (when (and description (not (str/blank? description)))
                             (str " — " description)))))
                   "  (no events)")))))))

;;; ----- LLM call + repair loop -----

(defn- call-llm
  "Invoke the LLM with a given JSON schema. `llm-config` is a map with
  `:model`, `:temperature`, `:max-tokens`, and (optional) `:thinking-config` —
  each phase owns its own. Returns
  `{:response <parsed-json-map> :parts [<aisdk-part>...]}`. The `:parts`
  list is the raw streamed trace — reasoning blocks, any free-form text the
  model emitted alongside the tool call, the tool call itself, and usage —
  and is what we persist in the transcript so we can see why the model
  produced what it did."
  [llm-config messages schema tag]
  (let [{:keys [model temperature max-tokens thinking-config]} llm-config
        {:keys [result parts]}
        (metabot.self/call-llm-structured-with-trace
         model
         messages
         schema
         temperature
         max-tokens
         (cond-> {:request-id (str (random-uuid))
                  :source     "exploration"
                  :tag        tag}
           thinking-config (assoc :thinking thinking-config)))]
    {:response result :parts parts}))

(defn- summarize-parts
  "Pull the human-relevant pieces out of an AISDK parts trace so the persisted
  transcript stays readable. Concatenates reasoning blocks and non-tool text
  separately; keeps the raw parts list under `:all` for full fidelity."
  [parts]
  (let [reasoning (->> parts (filter #(= :reasoning (:type %))) (map :reasoning) (str/join "\n"))
        text      (->> parts (filter #(= :text (:type %))) (map :text) (str/join "\n"))
        usage     (some #(when (= :usage (:type %)) (:usage %)) parts)]
    (cond-> {:all parts}
      (seq reasoning) (assoc :reasoning reasoning)
      (seq text)      (assoc :text text)
      usage           (assoc :usage usage))))

(defn run-with-repair
  "Phase-agnostic LLM call + validate + one repair retry. Returns

      {:value        <validated-value-or-nil>
       :attempts     [<attempt>...]
       :outcome      :ok | :failed
       :final-errors [<error-strings...>]} ; only when :failed

  Args:
    thread-id      - exploration_thread id, used for logging
    phase-name     - \"phase-1\" / \"phase-2\" — used in log lines and the
                     usage tag (`exploration-auto-insights-<phase>`)
    llm-config     - `{:model :temperature :max-tokens :thinking-config}`
                     — the phase's own LLM settings
    prompt         - the rendered user prompt string
    schema         - JSON Schema for the structured response
    extract-fn     - response → extracted value (e.g. PM doc or curation map)
    validate-fn    - extracted value → vector of error strings ([] = valid)
    repair-builder - (previous-value errors) → repair user message string"
  [{:keys [thread-id phase-name llm-config prompt schema
           extract-fn validate-fn repair-builder]}]
  (let [tag             (str "exploration-auto-insights-" phase-name)
        first-messages  [{:role "user" :content prompt}]
        {first-response :response
         first-parts    :parts} (call-llm llm-config first-messages schema tag)
        first-value     (extract-fn first-response)
        first-errors    (vec (validate-fn first-value))
        attempt-1       {:attempt           1
                         :messages          first-messages
                         :response          first-response
                         :trace             (summarize-parts first-parts)
                         :value             first-value
                         :validation-errors first-errors}]
    (if (empty? first-errors)
      {:value first-value :attempts [attempt-1] :outcome :ok}
      (do
        (log/warnf "Automatic Insights %s for thread %d: validation failed on first attempt; retrying once.\nErrors:\n%s"
                   phase-name thread-id (format-errors first-errors))
        (let [retry-msg       (repair-builder first-value first-errors)
              retry-messages  (conj first-messages
                                    {:role "assistant" :content (pr-str first-response)}
                                    {:role "user" :content retry-msg})
              {retry-response :response
               retry-parts    :parts} (call-llm llm-config retry-messages schema tag)
              retry-value     (extract-fn retry-response)
              retry-errors    (vec (validate-fn retry-value))
              attempt-2       {:attempt           2
                               :messages          retry-messages
                               :response          retry-response
                               :trace             (summarize-parts retry-parts)
                               :value             retry-value
                               :validation-errors retry-errors}]
          (if (empty? retry-errors)
            (do (log/infof "Automatic Insights %s for thread %d: repair succeeded on retry" phase-name thread-id)
                {:value retry-value :attempts [attempt-1 attempt-2] :outcome :ok})
            (do (log/warnf "Automatic Insights %s for thread %d: repair failed; giving up.\nErrors:\n%s"
                           phase-name thread-id (format-errors retry-errors))
                {:value        nil
                 :attempts     [attempt-1 attempt-2]
                 :outcome      :failed
                 :final-errors retry-errors})))))))
