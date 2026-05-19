(ns metabase.metabot.quality.compose
  "Composite assembly for the BOT-1515 conversation quality score.

  Two pure functions:

    `signal-contribution` — turn one signal's raw magnitude into its raw
    concern contribution. Dispatches on `:kind` from `signal-params`:
    `:event-count` is `k × magnitude`; `:excess` is `k × max(0, m - baseline)`.

    `compose-score` — sum the contributions, soft-saturate to `[0, 1)`, and
    negate. Returns the score plus the intermediate values so callers can
    persist a fully audit-friendly breakdown."
  (:require
   [metabase.metabot.quality.constants :as constants]))

(set! *warn-on-reflection* true)

(defn signal-contribution
  "Raw concern contribution of one signal.

  `signal-key` must be present in `constants/signal-params`; unknown keys throw
  rather than silently contributing zero so that a typo in caller code is
  caught at the boundary rather than masked by the composite.

  `magnitude` is the raw magnitude reported by the signal predicate — already
  a non-negative count for `:event-count` signals, the raw (pre-baseline)
  metric value for `:excess` signals."
  [signal-key magnitude]
  (let [params (get constants/signal-params signal-key)]
    (when-not params
      (throw (ex-info "Unknown quality signal" {:signal signal-key})))
    (let [{:keys [k kind baseline]} params
          m                         (double magnitude)]
      (case kind
        :event-count (* k m)
        :excess      (* k (max 0.0 (- m baseline)))))))

(defn compose-score
  "Compose per-signal magnitudes into the v1 conversation quality score.

  Input: a map from `signal-key` → magnitude. Keys missing from the input are
  treated as magnitude 0 so callers can compute and supply only the signals
  that fired, but the returned `:contributions` map always contains every key
  in `constants/signal-keys` so the breakdown jsonb has a stable shape.

  Output:
    {:quality_score (- concern)                — in (-1, 0]
     :concern       raw / (raw + C)            — in [0, 1)
     :raw           Σ contributions            — in [0, ∞)
     :contributions {signal-key → contribution}}

  The output is deterministic: same input → same numbers, to floating-point
  precision."
  [signal-magnitudes]
  (let [contributions (into {}
                            (map (fn [k]
                                   [k (signal-contribution
                                       k (get signal-magnitudes k 0))]))
                            constants/signal-keys)
        raw           (reduce + 0.0 (vals contributions))
        concern       (/ raw (+ raw (double constants/saturation-C)))
        ;; Coerce a zero-signal score to positive 0.0 so consumers that JSON-
        ;; encode the score never see "-0.0". (- 0.0) is -0.0 in JVM doubles.
        score         (if (zero? concern) 0.0 (- concern))]
    {:quality_score score
     :concern       concern
     :raw           raw
     :contributions contributions}))
