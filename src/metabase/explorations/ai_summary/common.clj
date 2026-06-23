(ns metabase.explorations.ai-summary.common
  "Shared infrastructure for the two-phase AI Summary pipeline.

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
   [metabase.lib.core :as lib]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.metabot.self :as metabot.self]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (clojure.lang ExceptionInfo)
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

(defn- format-num
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

(defn- time-series-key-points
  "Build the per-series key-points map from a `chart-stats` blob's time-series
  entry. All values are pulled from the cached `chart_stats` — we no longer
  re-scan the y-array client-side. Returns nil when the series doesn't have
  the expected time-series shape."
  [{:keys [peak trough above-mean data-points summary trend time-range] :as series-stats}]
  (when (and peak trough series-stats)
    {:peak       [(:x peak) (:y peak)]
     :trough     [(:x trough) (:y trough)]
     :first      [(:start time-range) (:start-value trend)]
     :last       [(:end time-range)   (:end-value trend)]
     :change-pct (:overall-change-pct trend)
     :mean       (:mean summary)
     :n          data-points
     :above-mean above-mean}))

(defn- categorical-key-points
  "Build the per-series key-points map from a `chart-stats` blob's categorical
  entry. Uses the existing `:top-categories` / `:bottom-categories` and the
  summary stats — no recomputation needed. Returns nil when the series
  doesn't have the expected categorical shape."
  [{:keys [top-categories bottom-categories data-points summary]}]
  (let [top    (first top-categories)
        bottom (or (last bottom-categories)
                   (last top-categories))]
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
      (let [[sname _] (first series-entries)]
        (if-let [kp (key-points-from-stats chart-stats sname)]
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
                          ": " (format-num fv) " → " (format-num lv)
                          " (" (format-pct change-pct) ")")))
                 ", peak " (format-num pv) " at " px
                 (when (not= pv tv) (str ", trough " (format-num tv)))))
          (let [total-points (reduce + 0 (map (fn [[_ s]] (count (:x_values s))) series-entries))]
            (str total-points " non-numeric points"
                 (when (> (count series-entries) 1)
                   (str " across " (count series-entries) " series")))))))))

(defn chart-rank-score
  "Numeric display hint for a hydrated query: prefer the LLM-judged contextual
  score, fall back to the deterministic interestingness, then 0. Stamped onto the
  prepped record as `:score` and shown in the Phase-1 index. NOT the sort key —
  see [[chart-rank-key]], which orders by *both* signals."
  [q]
  (or (:contextual_interestingness_score q)
      (:interestingness_score q)
      0.0))

(defn chart-rank-key
  "Descending-better lexicographic sort key for a hydrated query.

  Contextual interestingness is the coarse, generally bucketed primary
  stratum (the classifier tends to cluster scores around ~1.0/0.7/0.5/0.2).
  Deterministic interestingness is the continuous secondary key that orders charts
  *within* a contextual bucket, so ordering stays meaningful when dozens of charts
  share a bucket — the old `(or ctx det)` threw this away whenever a contextual
  score existed. `:id` is a stable final tiebreak for a fully deterministic total
  order. Sort best-first with a descending vector comparator, e.g.
  `(sort-by chart-rank-key u/reverse-compare qs)`."
  [q]
  [(double (or (:contextual_interestingness_score q) 0.0))
   (double (or (:interestingness_score q) 0.0))
   (- (long (or (:id q) 0)))])

(defn- rank-desc
  "Comparator over hydrated queries: best [[chart-rank-key]] first."
  [a b]
  (compare (chart-rank-key b) (chart-rank-key a)))

(defn- round-robin
  "Flatten a seq of best-first seqs by taking the head of each in turn, dropping
  emptied seqs as they run out. Preserves the outer ordering within each round."
  [colls]
  (lazy-seq
   (when-let [colls (seq (filter seq colls))]
     (concat (map first colls)
             (round-robin (map rest colls))))))

(defn- metric-queue
  "Order one metric's charts best-first while spreading across its breakouts: a
  round-robin over `(dimension, segment)` groups (each ordered by [[chart-rank-key]],
  groups themselves ordered by their best chart) so one breakout's variant fan-out —
  or one heavily-segmented dimension — can't consume the metric's whole allocation
  before another breakout is seen."
  [charts]
  (->> charts
       (group-by (juxt :dimension_id :segment_id))
       vals
       (map #(sort rank-desc %))
       (sort-by first rank-desc)
       round-robin))

(def ^:private metric-breakout-decay
  "Geometric discount applied to each successive breakout from the same metric while filling
  the pool: the metric's k-th breakout (in [[metric-queue]] / breakout-spread order) is
  weighted `relevance × decay^(k-1)`.

  This gives *relevance-weighted* diversity rather than flat round-robin. Whether a
  less-relevant metric's top breakout outranks a more-relevant metric's k-th breakout depends
  on the *ratio* of their relevances (`decay^k < r_lo/r_hi`), so the behaviour adapts to the
  data instead of relying on the contextual score's (intentionally blocky, only-a-guideline)
  tier structure:
   - a big relevance gap → the strong metric earns several breakouts before a marginal one
     earns any (a clearly-pointless metric is squeezed out entirely);
   - comparable metrics interleave, so a very-interesting metric does NOT crowd out a
     sort-of-interesting one.

  ~0.6 hedges against an over-confident or incomplete contextual
  score by keeping sort-of-interesting metrics represented. Tunable: → 1 approaches pure
  global ranking (strong metric monopolizes), → 0 approaches flat round-robin (egalitarian)."
  0.6)

(defn select-pool
  "Pick up to `n` charts from `queries`, balanced across metrics so a single base metric with
  many interesting breakouts can't crowd out other metric views — while still giving more
  slots to more-relevant metrics.

  The chart explosion comes from one metric (`:card_id`) being sliced many ways —
  variants × dimensions × segments. A pure global ranking lets the strongest metric fill the
  whole pool; a flat round-robin over-corrects, giving a pointless metric as many breakouts as
  the best one. Instead, each chart gets an adjusted score = its [[chart-rank-score]]
  relevance × [[metric-breakout-decay]] raised to the chart's position within its metric (in
  [[metric-queue]] breakout-spread order, so fresh dimensions outrank redundant renderings),
  and we take the global top-`n` by adjusted score. See [[metric-breakout-decay]] for the
  relevance-vs-diversity behaviour. The caller re-sorts the survivors by [[chart-rank-key]]
  for best-first display."
  [n queries]
  (->> queries
       (group-by :card_id)
       vals
       (mapcat (fn [metric-charts]
                 (map-indexed (fn [pos c]
                                [(* (chart-rank-score c) (Math/pow metric-breakout-decay pos)) c])
                              (metric-queue metric-charts))))
       (sort-by (fn [[adj c]] [adj (chart-rank-key c)]) u/reverse-compare)
       (map second)
       (take n)
       vec))

(defn variant-label
  "Short, human label for a chart's rendering variant — for the Phase-2 menu that lets the
  analyst pick the rendering that best fits a point. The variant's params (k, filter values)
  are already visible in the chart title, so the label stays terse."
  [query-type]
  (case query-type
    "default"               "full breakdown"
    "top-n-other"           "top-N + Other"
    "temporal-pattern-day"  "by day-of-week"
    "temporal-pattern-hour" "by hour-of-day"
    "time-facet"            "series over time"
    "filtered-subset"       "filtered subset"
    "per-value-time-series" "single value over time"
    (or query-type "variant")))

(defn breakout-key
  "Identity of the breakout a prepped chart belongs to: metric × dimension × segment.
  Variants (`default`, `top-n-other`, `time-facet`, …) of the same breakout share this key."
  [c]
  [(:card-id c) (:dimension-id c) (:segment-id c)])

(defn- variant-sort-key
  "Descending-better sort key for a prepped variant within its breakout: best `:score` first,
  stable on id."
  [c]
  [(double (:score c 0.0)) (- (long (:exploration-query-id c)))])

(defn group-breakouts
  "Group prepped charts into breakouts (metric × dimension × segment), bundling each
  breakout's rendering variants so Phase 2 can present the whole menu and let the analyst
  embed whichever rendering best supports each point. Within a breakout, variants are ordered
  best-first by `:score` (stable on id); the breakout's `:representative`, `:rep-id`, and
  `:score` are its best variant. Breakouts are returned best-first.

      => [{:rep-id N :representative <prepped> :variants [<prepped> ...] :score s} ...]"
  [prepped]
  (->> prepped
       (group-by breakout-key)
       vals
       (map (fn [variants]
              (let [sorted (vec (sort-by variant-sort-key u/reverse-compare variants))
                    rep    (first sorted)]
                {:rep-id         (:exploration-query-id rep)
                 :representative rep
                 :variants       sorted
                 :score          (:score rep)})))
       (sort-by (fn [b] [(double (:score b 0.0)) (- (long (:rep-id b)))])
                u/reverse-compare)
       vec))

(defn prep-chart
  "Compute the rich per-chart record both phases consume.

  Returns nil when the cached stats are missing (chart-config couldn't be built at execution
  time) or anything throws. The same prepped record is reused for the Phase-1 index entry,
  the slim Phase-2 awareness block, and the full Phase-2 top-tier block — only the
  rendering differs.

  Beyond `cfg` (used for stats / data-point rendering), the record carries:
   - `:metric-description` / `:chart-description` — the effective descriptions persisted on
     the `exploration_query_result` row. The runner already substitutes the Card's authored
     description into `metric_description` when present, so consumers read these verbatim
     without needing to know the source.
   - `:dim-detail` / `:metric-detail` — short strings derived from the raw QP-result column
     metadata, used to disambiguate charts that share a title but differ on temporal bucket,
     FK source, or aggregation type.

  Arguments:
   - `query`     — the `:model/ExplorationQuery` row.
   - `persisted` — `{:result-data :chart-stats :metric-description :chart-description}` from
                   the matching `exploration_query_result` row (see `load-result-rows`)."
  [query {:keys [result-data chart-stats stored-result-id metric-description chart-description]}]
  (try
    (when (and result-data chart-stats)
      (let [qp-result (deserialize-result result-data)
            lib-q     (explorations.interestingness/exploration-query->lib-query query)
            lib-cols  (lib/returned-columns lib-q)
            rows      (get-in qp-result [:data :rows])
            cfg       (explorations.interestingness/chart-config query lib-cols rows)]
        (when cfg
          (let [metric-idx (first (keep-indexed (fn [i c] (when (lib.types.isa/numeric? c) i))
                                                lib-cols))
                ;; safe-chart-config (in the runner) only succeeds for exactly-2-column
                ;; results, so the dim column is the other index — `(- 1 metric-idx)`
                ;; flips 0↔1.
                dim-idx    (when metric-idx (- 1 metric-idx))
                dim-col    (when dim-idx (nth lib-cols dim-idx nil))
                metric-col (when metric-idx (nth lib-cols metric-idx nil))]
            {:exploration-query-id (:id query)
             :stored-result-id     stored-result-id
             :name                 (:name query)
             :score                (chart-rank-score query)
             ;; breakout identity (metric × dimension × segment) + which rendering this is —
             ;; lets Phase 2 group a breakout's variants and offer the analyst the menu.
             :card-id              (:card_id query)
             :dimension-id         (:dimension_id query)
             :segment-id           (:segment_id query)
             :query-type           (:query_type query)
             :variant-label        (variant-label (:query_type query))
             :display-type         (:display_type cfg)
             :cfg                  cfg
             :stats                chart-stats
             :summary-line         (chart-summary-line cfg chart-stats)
             :dim-detail           (explorations.interestingness/lib-col->detail lib-q dim-col)
             :metric-detail        (explorations.interestingness/lib-col->detail lib-q metric-col)
             :metric-description   (some-> metric-description str/trim not-empty)
             :chart-description    (some-> chart-description str/trim not-empty)}))))
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
  produced what it did.

  When extended thinking is enabled, Claude uses `tool_choice: auto` and the
  model can legitimately respond with reasoning + text but no tool call. The
  underlying `call-llm-structured-with-trace` throws in that case. We catch it
  here and return `{:response nil :parts <parts>}` so the validate / repair
  loop in [[run-with-repair]] can ask for a properly-formatted tool call on
  the retry, rather than letting the throw bubble all the way out and skip the
  repair path entirely."
  [llm-config messages schema tag]
  (let [{:keys [model temperature max-tokens thinking-config]} llm-config
        opts (cond-> {:request-id          (str (random-uuid))
                      :source              "exploration"
                      :tag                 tag
                      :required-permission :permission/metabot-other-tools
                      ;; One-shot calls: the big prompt prefix is only ever reread on a
                      ;; repair retry (rare), so Anthropic prompt caching mostly just charges
                      ;; the cache-write premium for zero reads. Opt out.
                      :cache?              false}
               thinking-config (assoc :thinking thinking-config))]
    (try
      (let [{:keys [result parts]}
            (metabot.self/call-llm-structured-with-trace
             model messages schema temperature max-tokens opts)]
        {:response result :parts parts})
      (catch ExceptionInfo e
        ;; Fall back to the repair loop when the model returned no tool call
        ;; (legitimate with extended thinking + tool_choice auto). For permission
        ;; denial / usage-limit hits, and anything else, let generate-ai-summary!
        ;; see the throw and route to a skip outcome.
        (let [{ex-type :type parts :parts} (ex-data e)]
          (if (and parts (not (#{:metabot/permission-denied :metabot/usage-limit-reached} ex-type)))
            (do (log/warnf "AI Summary LLM call did not produce a tool call (tag=%s); falling back to repair loop" tag)
                {:response nil :parts parts})
            (throw e)))))))

(defn- summarize-parts
  "Pull the human-relevant pieces out of an AISDK parts trace so the persisted
  transcript stays readable. Concatenates reasoning blocks and non-tool text
  separately; keeps the raw parts list under `:all` for full fidelity."
  [parts]
  (let [by-type   (group-by :type parts)
        reasoning (->> (:reasoning by-type) (map :reasoning) (str/join "\n"))
        text      (->> (:text by-type) (map :text) (str/join "\n"))
        usage     (:usage (first (:usage by-type)))]
    (cond-> {:all parts}
      (seq reasoning) (assoc :reasoning reasoning)
      (seq text)      (assoc :text text)
      usage           (assoc :usage usage))))

(defn- run-attempt
  "Run a single LLM call + extract + validate, returning one attempt map for the transcript.
  `ctx` carries the call settings shared across attempts: `{:llm-config :schema :tag
  :extract-fn :validate-fn}`."
  [{:keys [llm-config schema tag extract-fn validate-fn]} n messages]
  (let [{:keys [response parts]} (call-llm llm-config messages schema tag)
        value (extract-fn response)]
    {:attempt           n
     :messages          messages
     :response          response
     :trace             (summarize-parts parts)
     :value             value
     :validation-errors (vec (validate-fn value))}))

(defn run-with-repair
  "Phase-agnostic LLM call + validate + one repair retry. Returns

      {:value        <validated-value-or-nil>
       :attempts     [<attempt>...]
       :outcome      :ok | :failed
       :final-errors [<error-strings...>]} ; only when :failed

  Args:
    thread-id      - exploration_thread id, used for logging
    phase-name     - \"phase-1\" / \"phase-2\" — used in log lines and the
                     usage tag (`exploration-ai-summary-<phase>`)
    llm-config     - `{:model :temperature :max-tokens :thinking-config}`
                     — the phase's own LLM settings
    prompt         - the rendered user prompt string
    schema         - JSON Schema for the structured response
    extract-fn     - response → extracted value (e.g. PM doc or curation map)
    validate-fn    - extracted value → vector of error strings ([] = valid)
    repair-builder - (previous-value errors) → repair user message string"
  [{:keys [thread-id phase-name llm-config prompt schema
           extract-fn validate-fn repair-builder]}]
  (let [ctx       {:llm-config  llm-config
                   :schema      schema
                   :tag         (str "exploration-ai-summary-" phase-name)
                   :extract-fn  extract-fn
                   :validate-fn validate-fn}
        attempt-1 (run-attempt ctx 1 [{:role "user" :content prompt}])]
    (if (empty? (:validation-errors attempt-1))
      {:value (:value attempt-1) :attempts [attempt-1] :outcome :ok}
      (do
        (log/warnf "AI Summary %s for thread %d: validation failed on first attempt; retrying once.\nErrors:\n%s"
                   phase-name thread-id (format-errors (:validation-errors attempt-1)))
        (let [retry-msg (repair-builder (:value attempt-1) (:validation-errors attempt-1))
              attempt-2 (run-attempt ctx 2 (conj (:messages attempt-1)
                                                 {:role "assistant" :content (pr-str (:response attempt-1))}
                                                 {:role "user" :content retry-msg}))]
          (if (empty? (:validation-errors attempt-2))
            (do (log/infof "AI Summary %s for thread %d: repair succeeded on retry" phase-name thread-id)
                {:value (:value attempt-2) :attempts [attempt-1 attempt-2] :outcome :ok})
            (do (log/warnf "AI Summary %s for thread %d: repair failed; giving up.\nErrors:\n%s"
                           phase-name thread-id (format-errors (:validation-errors attempt-2)))
                {:value        nil
                 :attempts     [attempt-1 attempt-2]
                 :outcome      :failed
                 :final-errors (:validation-errors attempt-2)})))))))
