(ns metabase.metabot.quality.corpus-stats
  "Corpus-relative outlier threshold for the `n-expensive-turn` signal.

  Computes a modified-Z (MAD-based) outlier threshold over the recent
  per-turn token distribution drawn from `metabot_message`, and caches the
  result for `corpus-stats-ttl-ms` to keep scoring cheap.

  Public API:
    `outlier-threshold` — zero-arg. Returns
      `{:threshold N :corpus-size M}` when the rolling-window corpus is at
      least `min-corpus-size` rows, else `nil`. Memoized via TTL in prod;
      pass-through in dev to keep REPL development seeing live values
      (mirrors `metabase.search.appdb.scoring/view-count-percentiles`).

    `threshold-stats` — pure compute. Same return shape, computed over an
      injected seq of token values. The unit-testable entry point.

  Cross-reference:
    notes/bot-1515-conversation-score/impl-phase-1-testing-notes.md"
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.config.core :as config]
   [metabase.metabot.quality.constants :as constants]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Pure compute
;; ---------------------------------------------------------------------------

(defn- median
  "Median of an already-sorted numeric collection. Returns nil for an empty
  collection. For even n, interpolates between the two middle values."
  [sorted-vals]
  (let [n (count sorted-vals)]
    (when (pos? n)
      (if (odd? n)
        (double (nth sorted-vals (quot n 2)))
        (/ (+ (double (nth sorted-vals (dec (quot n 2))))
              (double (nth sorted-vals (quot n 2))))
           2.0)))))

(defn- mad
  "Median absolute deviation around `med` over `vals` (need not be sorted)."
  [vals med]
  (median (sort (map #(Math/abs (- (double %) (double med))) vals))))

(defn threshold-stats
  "Pure compute. Given a seq of numeric `total_tokens` values, return

    {:threshold (+ median ((outlier-z-threshold / mad-scale) × MAD))
     :corpus-size (count vals)}

  Returns nil when `(count vals) < min-corpus-size` so callers can treat
  insufficient-corpus as 'signal silent' rather than threshold-zero (which
  would flag every turn). This is the unit-test entry point — tests pass a
  fixed seq and check the math without touching the appdb."
  [vals]
  (let [n (count vals)]
    (when (>= n constants/min-corpus-size)
      (let [sorted (vec (sort vals))
            med    (median sorted)
            m      (double (or (mad sorted med) 0))
            thr    (+ med (* (/ (double constants/outlier-z-threshold)
                                (double constants/mad-scale))
                             m))]
        {:threshold   thr
         :corpus-size n}))))

;; ---------------------------------------------------------------------------
;; appdb fetch + memoization
;; ---------------------------------------------------------------------------

(defn- corpus-window-cutoff
  "Cutoff instant for the rolling-window corpus filter — `now -
  corpus-window-months`. Computed in Clojure (UTC, calendar-month accurate)
  to keep the WHERE-clause portable across Postgres / MySQL / H2."
  ^java.time.Instant []
  (-> (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC)
      (.minusMonths (long constants/corpus-window-months))
      .toInstant))

(defn- fetch-corpus-tokens
  "Reads `total_tokens` for non-deleted assistant `metabot_message` rows within
  the rolling window. No JSON inspection, no join to `metabot_conversation` —
  the latter would self-defeat during backfill (every row's `quality_score`
  is NULL by definition, so a join-restricted threshold would return nil
  throughout the run)."
  []
  (->> (t2/query {:select [:total_tokens]
                  :from   [:metabot_message]
                  :where  [:and
                           [:= :role "assistant"]
                           [:> :total_tokens 0]
                           [:= :deleted_at nil]
                           [:>= :created_at (corpus-window-cutoff)]]})
       (map :total_tokens)))

(defn- outlier-threshold*
  "Impure inner: fetch the corpus and run `threshold-stats`. Wrapped by the
  public `outlier-threshold` var below."
  []
  (threshold-stats (fetch-corpus-tokens)))

(def ^{:arglists '([])}
  outlier-threshold
  "Compute (or return cached) corpus-relative outlier threshold for the
  `n-expensive-turn` signal. Returns `{:threshold ... :corpus-size N}` when
  the rolling-window corpus has at least `min-corpus-size` rows, else `nil`.

  Memoized for `corpus-stats-ttl-ms` in prod; pass-through in dev so REPL
  development sees the live value (mirrors
  `metabase.search.appdb.scoring/view-count-percentiles`)."
  (if config/is-prod?
    (memoize/ttl outlier-threshold*
                 :ttl/threshold constants/corpus-stats-ttl-ms)
    outlier-threshold*))
