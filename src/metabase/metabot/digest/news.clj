(ns metabase.metabot.digest.news
  "Is anything actually happening in the data behind a digest candidate?

  Relevance (see [[metabase.metabot.digest.signals]]) says an entity belongs to a user. News says it has something
  to report *right now*. The two are independent: a dashboard you built and check weekly is relevant every day,
  and newsworthy only on the days its numbers do something unusual.

  Detection here is deterministic. An outlier is a fact — a point whose modified z-score against the series'
  median exceeds `metabase.interestingness.chart.outliers`' threshold — not a judgement, so no model is involved.
  The model's job is downstream: deciding whether a detected outlier is worth mentioning, and saying so in
  English.

  \"Did this exist last week?\" is answered by *where* the outlier sits, not by comparing against a stored
  snapshot. Over a windowed series the last bucket is now, so an outlier at the final index is new and one in the
  middle is history the user has already lived through. That is why nothing here persists state.

  Strategies
  ----------
  Getting a scoreable series out of a candidate is pluggable, because the easy case does not cover everything.
  [[strategies]] is tried in order and the first non-nil wins, so each strategy is free to decline by returning
  nil. `:card-as-is` handles entities whose own query already produces a temporal series — no rewriting, so what
  we score is exactly what the user sees. The rest are declared but unimplemented; see their defmethods."
  (:require
   [metabase.explorations.core :as explorations]
   [metabase.interestingness.core :as interestingness]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.util.log :as log])
  (:import
   (java.time Instant LocalDate OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Static eligibility -----------------------------------------------

(defn- temporal-breakout?
  "Whether `query` (a Lib query as read off a Card) breaks out by a temporal unit.

  Cheap and static: no query runs. Worth doing first because most candidates fail it — on a real instance roughly
  two thirds — and running them only to discover the result cannot be scored is the expensive way to learn that."
  [query]
  (boolean
   (when (map? query)
     (some (fn [stage]
             (and (= :mbql.stage/mbql (:lib/type stage))
                  (some (fn [breakout]
                          (and (vector? breakout)
                               (= :field (first breakout))
                               (:temporal-unit (second breakout))))
                        (:breakout stage))))
           (:stages query)))))

;;; -------------------------------------------------- Strategies ---------------------------------------------------

(defmulti series-for
  "Produce a scoreable `metabase.interestingness.chart.types/chart-config` for `card`, or nil when this strategy
  does not apply to it. Dispatches on the strategy keyword."
  {:arglists '([strategy card])}
  (fn [strategy _card] strategy))

(defmethod series-for :default
  [strategy _card]
  (log/warnf "Unknown digest news strategy %s" strategy)
  nil)

(defmethod series-for :card-as-is
  [_strategy card]
  ;; The faithful case: the card already asks a temporal question, so run it untouched. What we score is what the
  ;; user sees, which is the only strategy that can say so.
  (when (temporal-breakout? (:dataset_query card))
    (try
      (let [result (qp/process-query (:dataset_query card))
            rows   (get-in result [:data :rows])
            ;; A Card's `:display` is a keyword; an ExplorationQuery's is a string, and the chart-config schema
            ;; wants the string. Nothing catches this until an outlier is found and scoring actually runs.
            card   (update card :display #(some-> % name))]
        ;; `chart-config` returns nil when the shape still isn't scoreable — wrong column count, no numeric
        ;; column. That second gate is why the static check above can afford to be loose.
        (some-> (explorations/chart-config card (explorations/exploration-query->lib-cols card) rows)
                (assoc :query (:dataset_query card))))
      (catch Exception e
        (log/warnf "Digest news: card %s failed to run: %s" (:id card) (ex-message e))
        nil))))

(def ^:private probe-window-weeks
  "How far back a derived probe looks. Long enough for the median absolute deviation to have a baseline, short
  enough that a genuine recent move is not averaged into two years of history."
  26)

(def ^:private max-probe-series
  "Most distinct values a dimension may have before a probe declines it. Breaking revenue out by product *title*
  would produce hundreds of series of noise, each with its own outliers, and nothing legible at the end of it."
  12)

(defn- probe-temporal-column
  "The column a derived probe should bucket by: a creation timestamp on the query's own source table, in
  preference to the many temporal columns that arrive through foreign keys. Breaking orders out by the
  *customer's birth date* is a coherent query and a meaningless one."
  [query table-id]
  (let [temporal (filter #(isa? (:effective-type %) :type/Temporal) (lib/breakoutable-columns query))
        own      (filter #(= (:table-id %) table-id) temporal)]
    (or (first (filter #(isa? (:semantic-type %) :type/CreationTimestamp) own))
        (first own))))

(defmethod series-for :dimensional-probe
  [_strategy card]
  ;; For a card that groups by something non-temporal — "revenue by category" — the card itself cannot show a
  ;; trend, but its ingredients can. Keep the aggregation and the dimension, add a time axis, and the result says
  ;; which *member* of that dimension moved. That is strictly more informative than the aggregate: "revenue
  ;; spiked, entirely on Gizmo" versus "revenue spiked".
  (try
    (let [mp    (lib-be/application-database-metadata-provider (:database_id card))
          query (lib/query mp (:dataset_query card))
          bs    (lib/breakouts query)]
      (when (and (seq (lib/aggregations query))
                 (= 1 (count bs))
                 (not (temporal-breakout? (:dataset_query card))))
        (when-let [temporal-col (probe-temporal-column query (:table_id card))]
          (let [probe (-> query
                          (lib/breakout (lib/with-temporal-bucket temporal-col :week))
                          (lib/filter (lib/time-interval temporal-col (- probe-window-weeks) :week)))
                rows (get-in (qp/process-query probe) [:data :rows])
                cfg  (explorations/chart-config (-> card
                                                    (assoc :dataset_query probe)
                                                    (update :display #(some-> % name)))
                                                (lib/returned-columns probe)
                                                rows)]
            ;; Cardinality is read off the built config rather than off a column position. The added temporal
            ;; breakout appends, so the dimension is not at a predictable index — but `chart-config` has already
            ;; worked out the column roles, and one series per dimension member is exactly the count we want.
            (when (and cfg (<= (count (:series cfg)) max-probe-series))
              ;; Carry the probe itself, still as Lib: `chart-config` is validated as MBQL 5, so a legacy query
              ;; here fails the whole config. Conversion happens on the way out, in [[news-for]].
              (assoc cfg :query probe))))))
    (catch Exception e
      (log/warnf "Digest news: dimensional probe failed for card %s: %s" (:id card) (ex-message e))
      nil)))

(defmethod series-for :widen-filter
  [_strategy _card]
  ;; TODO: take a card that aggregates over a fixed period and widen its temporal filter to expose a series.
  ;; Only safe for MBQL, and never for a card whose filter is the point of the question.
  nil)

(def strategies
  "Ordered: most faithful to what the user actually looks at first. [[news-for]] takes the first that yields a
  series, so adding one is a new defmethod plus an entry here."
  [:card-as-is :dimensional-probe :widen-filter])

;;; ---------------------------------------------------- News -------------------------------------------------------

(def ^:private recent-bucket-count
  "How many buckets at the end of the series count as \"now\". More than one because the final bucket is usually
  still filling — a week that is three days old looks like a collapse in volume, which is an artifact, not news."
  2)

(def ^:private min-buckets
  "Fewest buckets a series needs before its outliers mean anything. A modified z-score is computed against the
  median absolute deviation, which over three or four points is nearly degenerate — almost any value that is not
  the median reads as extreme. Short series do not produce weak signal, they produce confident nonsense."
  8)

(def ^:private max-stale-bucket-widths
  "How far past its final bucket a series may sit before it counts as stale rather than current, measured in
  bucket widths."
  2.0)

(defn- ->bucket-instant
  "Parse a bucket label into an Instant. Labels arrive in whatever shape the breakout produced — `2026-01-01`,
  `2026-09-13T00:00:00Z` — so several formats are tried before giving up."
  [label]
  (when (string? label)
    (or (try (.toInstant (OffsetDateTime/parse label)) (catch Exception _ nil))
        (try (.toInstant (.atStartOfDay (LocalDate/parse label) ZoneOffset/UTC)) (catch Exception _ nil))
        (try (Instant/parse label) (catch Exception _ nil)))))

(defn- current-series?
  "Whether `x-values` actually runs up to about now.

  [[series-outliers]] measures recency as a position in the series, which is only the same thing as recency in
  time when the series ends at the present. A card filtered to a fixed past window, or one whose table stopped
  being loaded, ends months ago — and its final buckets would otherwise be reported as news indefinitely.

  Fails closed: a series whose labels cannot be parsed is treated as stale, because for a digest a confidently
  wrong 'this just happened' is far more costly than a missed anomaly."
  [x-values ^Instant now]
  (let [instants (mapv ->bucket-instant x-values)]
    (when (and (every? some? instants) (> (count instants) 1))
      (let [gaps        (map (fn [a b] (- (.toEpochMilli ^Instant b) (.toEpochMilli ^Instant a)))
                             instants (rest instants))
            bucket-ms   (when (seq gaps) (apply max 1 (map long gaps)))
            last-ms     (.toEpochMilli ^Instant (last instants))
            behind-ms   (- (.toEpochMilli now) last-ms)]
        (and bucket-ms (<= behind-ms (* max-stale-bucket-widths bucket-ms)))))))

(defn- scoreable?
  "Whether a series is long enough and current enough for its outliers to mean anything."
  [chart-config now]
  (let [x-values (some-> (first (vals (:series chart-config))) :x_values)]
    (boolean
     (and (>= (count x-values) min-buckets)
          (current-series? x-values now)))))

(defn- series-outliers
  "Outliers across every series of `stats`, tagged with how many buckets from the end each sits.

  Read off the stats map rather than called for directly: `compute-chart-stats` already runs the detector, and
  it is the interestingness module's public surface. One spike can be reported by more than one series, so
  results are collapsed per bucket keeping the strongest — otherwise the digest says the same thing twice."
  [stats]
  (->> (for [[series-name series] (:series stats)
             :let [n (:data-points series)]
             :when (and n (pos? n))
             outlier (:outliers series)
             :let [buckets-from-end (- n 1 (:index outlier))]]
         {:series           series-name
          :label            (:label outlier)
          :value            (:value outlier)
          :modified-z-score (:modified-z-score outlier)
          :buckets-from-end buckets-from-end
          :recent?          (< buckets-from-end recent-bucket-count)})
       (group-by (juxt :series :label))
       vals
       (map (fn [dupes] (apply max-key #(abs (double (:modified-z-score %))) dupes)))
       (sort-by :buckets-from-end)
       vec))

(defn news-for
  "What is happening in the data behind `card`, or nil when nothing is.

  Returns `{:interestingness <0..1> :chart-type <kw> :outliers [...] :recent-outliers [...] :strategy <kw>}`.
  Nil means either that no strategy could build a series, or that the series was built and held nothing recent
  worth reporting — deliberately the same answer, because for a digest they mean the same thing."
  [card]
  (when-let [[strategy chart-config]
             (some (fn [strategy]
                     ;; paired so the result can report which strategy produced the series
                     (when-let [config (series-for strategy card)]
                       [strategy config]))
                   strategies)]
    ;; computed once and passed on: `chart-interestingness` would otherwise recompute the same stats
    (when (scoreable? chart-config (Instant/now))
      (let [stats           (interestingness/compute-chart-stats chart-config {})
            all-outliers    (series-outliers stats)
            recent-outliers (filterv :recent? all-outliers)]
        (when (seq recent-outliers)
          (let [{:keys [score]} (interestingness/chart-interestingness chart-config stats)]
            {:interestingness score
             :chart-type      (:chart-type stats)
             :strategy        strategy
             ;; The query the anomaly was found in, left in Lib form — that is what a client reads a
             ;; `dataset_query` as, so no conversion is wanted or needed.
             :query           (:query chart-config)
             :display         (:display_type chart-config)
             :outliers        all-outliers
             :recent-outliers recent-outliers}))))))

(defn news-by-metric
  "Anomalies across `metric-cards`, as `{card-id news}`, omitting metrics with nothing to report.

  Deliberately not scoped to a user. A metric's series is the same whoever is asking, so one scan serves every
  digest on the instance, where the per-card path re-runs the same query for each user who happens to care about
  the same thing. That is the economic argument for reaching entities through their metrics rather than directly:
  cost becomes a function of the library's size, not of how many people are reading."
  [metric-cards]
  (into {}
        (keep (fn [card]
                (when-let [news (news-for card)]
                  [(:id card) news])))
        metric-cards))
