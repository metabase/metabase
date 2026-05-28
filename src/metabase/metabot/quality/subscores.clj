(ns metabase.metabot.quality.subscores
  "Combine the conversation's quality metrics into subscores and a single
  composite.

  Data-Source Quality is the arithmetic mean over the non-`:na` data-source
  metric healths, and is itself N/A only when every such metric is `:na`.
  Execution Health is always applicable.

  The composite is the geometric mean over the non-N/A subscores, so a
  single weak subscore dominates. Pure given the metrics map from
  [[metabase.metabot.quality.metrics/compute]]."
  (:require
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.schema :as quality.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private data-source-metric-keys
  "Metric keys that compose Data-Source Quality, in registry order."
  (constants/metrics-for-subscore :data-source-quality))

(def ^:private execution-metric-keys
  "Metric keys that compose Execution Health, in registry order."
  (constants/metrics-for-subscore :execution-health))

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
  "Mean of the tool-call success rate (`1 −` the failure rate) and the
  termination health, so a clean run scores 1.0 and a fully failed,
  force-stopped run scores 0.0. Always applicable. Algebraically identical
  to `1 − mean(failure-rate, 1 − termination-health)`."
  ^double [metrics]
  (mean [(- 1.0 (:tool-call-failure-rate metrics))
         (:termination-health metrics)]))

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

(defn- na->nil
  "Map the `:na` sentinel to JSON null; pass any computed value through."
  [v]
  (when-not (= :na v) v))

(defn- subscore-entry
  "Build the persisted `{:value .. :metrics {..}}` map for one subscore:
  its composed health (already nil when N/A) plus its member metric
  healths, snake-cased and with `:na` rendered as JSON null."
  [value metric-keys metrics]
  {:value   value
   :metrics (into {}
                  (map (fn [k] [(constants/metric-json-key k) (na->nil (metrics k))]))
                  metric-keys)})

(mu/defn project-json :- ::quality.schema/projected
  "Project the metrics and composed-subscores maps (the results of
  [[metabase.metabot.quality.metrics/compute]] and [[compose]]) into the
  persisted JSON shape shared by the conversation-level `quality_breakdown`
  and the per-message `quality_attribution`: the headline `quality_score`
  (the composite) alongside a snake-cased `subscores` map. Each subscore
  nests its own `:value` (nil when N/A) and the `:metrics` that compose it.

  Single source of truth for the persisted shape so the two payloads can't
  drift apart."
  [metrics subs]
  {:quality_score (:composite subs)
   :subscores     {:data_source_quality (subscore-entry (:data-source-quality subs)
                                                        data-source-metric-keys metrics)
                   :execution_health    (subscore-entry (:execution-health subs)
                                                        execution-metric-keys metrics)}})

(comment
  ;; Healthy: grounded authoring, no tool errors, clean exit → composite 1.0.
  (compose {:grounded-source-share 1.0 :tool-call-failure-rate 0.0 :termination-health 1.0})

  ;; Nothing authored → Data-Source Quality N/A, composite = Execution Health.
  (compose {:grounded-source-share :na :tool-call-failure-rate 0.5 :termination-health 0.0}))
