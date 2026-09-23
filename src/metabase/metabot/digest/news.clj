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
   [metabase.query-processor :as qp]
   [metabase.util.log :as log]))

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
        (explorations/chart-config card (explorations/exploration-query->lib-cols card) rows))
      (catch Exception e
        (log/warnf "Digest news: card %s failed to run: %s" (:id card) (ex-message e))
        nil))))

(defmethod series-for :metric-probe
  [_strategy _card]
  ;; TODO: for a candidate with no temporal breakout of its own, derive a probe query from the metric it is built
  ;; on — source table plus a temporal dimension, bucketed weekly — and score that instead. Detects news in the
  ;; underlying metric rather than in the card's framing, so narration must say so.
  nil)

(defmethod series-for :widen-filter
  [_strategy _card]
  ;; TODO: take a card that aggregates over a fixed period and widen its temporal filter to expose a series.
  ;; Only safe for MBQL, and never for a card whose filter is the point of the question.
  nil)

(def strategies
  "Ordered: most faithful to what the user actually looks at first. [[news-for]] takes the first that yields a
  series, so adding one is a new defmethod plus an entry here."
  [:card-as-is :metric-probe :widen-filter])

;;; ---------------------------------------------------- News -------------------------------------------------------

(def ^:private recent-bucket-count
  "How many buckets at the end of the series count as \"now\". More than one because the final bucket is usually
  still filling — a week that is three days old looks like a collapse in volume, which is an artifact, not news."
  2)

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
    (let [stats           (interestingness/compute-chart-stats chart-config {})
          all-outliers    (series-outliers stats)
          recent-outliers (filterv :recent? all-outliers)]
      (when (seq recent-outliers)
        (let [{:keys [score]} (interestingness/chart-interestingness chart-config stats)]
          {:interestingness score
           :chart-type      (:chart-type stats)
           :strategy        strategy
           :outliers        all-outliers
           :recent-outliers recent-outliers})))))
