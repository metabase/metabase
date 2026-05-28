(ns metabase.metabot.quality.subscores
  "Combine the conversation's quality metrics into subscores and a single
  composite.

  Data-Source Quality is the arithmetic mean over the non-`:na` data-source
  metric healths, and is itself N/A only when every such metric is `:na`.
  Execution Health is always applicable.

  The composite is the geometric mean over the non-N/A subscores, so a
  single weak subscore dominates. Pure given the metrics map from
  [[metabase.metabot.quality.metrics/compute]].")

(set! *warn-on-reflection* true)

(def ^:private data-source-metric-keys
  "Metric keys that compose Data-Source Quality, in a stable order."
  [:grounding])

(defn- mean
  "Arithmetic mean of a non-empty seq of doubles."
  ^double [xs]
  (/ (reduce + 0.0 (map double xs))
     (double (count xs))))

(defn- geometric-mean
  "Geometric mean `(∏ xᵢ)^(1/n)` of a seq of subscores in `[0, 1]`. A single
  `0.0` zeroes the result. Returns `1.0` on empty input — defensive only,
  since Execution Health always contributes a member."
  ^double [xs]
  (let [n (count xs)]
    (if (zero? n)
      1.0
      (Math/pow (reduce * 1.0 (map double xs))
                (/ 1.0 (double n))))))

(defn- data-source-quality
  "Mean over the non-`:na` data-source metric healths, or nil when every
  one is `:na`."
  [metrics]
  (let [healths (remove #(= :na %) (map metrics data-source-metric-keys))]
    (when (seq healths)
      (mean healths))))

(defn- execution-health
  "`1 −` the mean of the tool-call failure rate and the termination signal,
  so a clean run scores 1.0 and a fully failed, force-stopped run scores
  0.0. Always applicable."
  ^double [metrics]
  (- 1.0 (mean [(:tool-call-failure-rate metrics)
                (:termination-signal metrics)])))

(defn compose
  "Group the metrics into subscores and produce the composite.

  ```clojure
  {:data-source-quality Double-or-nil   ; nil when N/A
   :execution-health    Double
   :composite           Double
   :na                  #{:data-source-quality}}
  ```

  Pure. `metrics` is the map from
  [[metabase.metabot.quality.metrics/compute]]."
  [metrics]
  (let [dsq    (data-source-quality metrics)
        eh     (execution-health metrics)
        active (cond-> [eh] (some? dsq) (conj dsq))
        na     (cond-> #{} (nil? dsq) (conj :data-source-quality))]
    {:data-source-quality dsq
     :execution-health    eh
     :composite           (geometric-mean active)
     :na                  na}))

(comment
  ;; Healthy: grounded authoring, no tool errors, clean exit → composite 1.0.
  (compose {:grounding 1.0 :tool-call-failure-rate 0.0 :termination-signal 0.0})

  ;; Nothing authored → Data-Source Quality N/A, composite = Execution Health.
  (compose {:grounding :na :tool-call-failure-rate 0.5 :termination-signal 1.0}))
