(ns metabase.metabot.quality.metrics
  "Pure per-conversation quality measurements. Each metric is a value in
  `[0, 1]` or `:na` when its denominator is empty. Most are healths (1 = good);
  the exception is `tool-call-failure-rate`, a rate (1 = bad) that
  [[metabase.metabot.quality.subscores]] inverts when it folds Execution Health.

  [[compute]] reads the normalized struct (with `:temporal` populated by
  [[metabase.metabot.quality.temporal/derive]]) and the batched governance
  map (the `{[type id-str] facts}` shape returned by
  [[metabase.metabot.quality.governance/resolve]]). Governance is consulted
  by the canonical metrics; metrics that need only the entity sets ignore
  it."
  (:require
   [clojure.set :as set]
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.governance :as governance]
   [metabase.metabot.tools.entity-usage :as entity-usage]))

(set! *warn-on-reflection* true)

(defn- data-source-key?
  "True for a set key `[type id-str]` whose type can be a canonical data
  source — a card-family entity or a table. Fields, dashboards, databases,
  and transforms are not data sources for canonical-share purposes."
  [[type _id]]
  (or (contains? entity-usage/card-family-types type) (= "table" type)))

(defn- grounded-source-share
  "Fraction of authored entities that were actually surfaced to the agent —
  `1 - |authored-but-never-seen| / |authored|`. The never-seen set is the
  authored entities absent from both the prompt context and every tool
  result, so the ratio is in `[0, 1]`. `:na` when nothing was authored."
  [normalized]
  (let [q (count (get-in normalized [:sets :Q]))]
    (if (zero? q)
      :na
      (- 1.0 (/ (double (count (get-in normalized [:sets :H])))
                (double q))))))

(defn- tool-call-failure-rate
  "Fraction of tool calls that returned an error. `0.0` when the
  conversation made no tool calls."
  ^double [normalized]
  (let [events (:tool-events normalized)
        total  (count events)]
    (if (zero? total)
      0.0
      (/ (double (count (filter (comp some? :error) events)))
         (double total)))))

(defn- artifact-validity-share
  "Fraction of authoring tool calls that produced a valid artifact —
  `valid-authoring-calls / authoring-calls`. A health in `[0, 1]` (1 = good):
  every authored artifact valid → `1.0`, all invalid → `0.0`. An authoring call
  is counted only when its result carried an explicit `:artifact-valid` stamp
  (`true` or `false`); calls with no stamp (in-flight turns, non-authoring
  tools, or authoring tools outside the query/transform/document family) are
  excluded from both numerator and denominator. Per-call by design — a turn that
  thrashes on invalid artifacts before succeeding scores poorly. `:na` when no
  stamped authoring call exists."
  [normalized]
  (let [evs (->> (:tool-events normalized)
                 (filter #(= :authoring (:tool-type %)))
                 (filter #(some? (:artifact-valid %))))]
    (if (empty? evs)
      :na
      (/ (double (count (filter #(true? (:artifact-valid %)) evs)))
         (double (count evs))))))

(defn- termination-health
  "`1.0` when the agent stopped on its own — signaled done or emitted a
  final response — and `0.0` for any other exit (hit the iteration cap,
  errored, was aborted, or an unrecognized state). A health in `[0, 1]`,
  1 = clean, matching the rest of the metric bag. Reads the categorical
  populated by [[metabase.metabot.quality.temporal/derive]]."
  ^double [normalized]
  (case (get-in normalized [:temporal :terminal-state])
    (:model_signaled_done :final_response) 1.0
    0.0))

(defn- canonical-key?
  "True iff the entity at set-key `k` resolves to a canonical data source
  in `governance`. A key absent from the map (deleted / inaccessible /
  not a card or table) is non-canonical."
  [governance k]
  (governance/canonical? (get governance k)))

(defn- canonical-source-share
  "Fraction of the card/table entities the agent authored against that are
  canonical. Fields are excluded from both sides — a field is not an
  independent data source and never resolves canonical. A card/table
  absent from `governance` counts as non-canonical. `:na` when nothing
  authorable against a data source was authored."
  [normalized governance]
  (let [ks (filter data-source-key? (keys (get-in normalized [:sets :Q])))]
    (if (empty? ks)
      :na
      (/ (double (count (filter #(canonical-key? governance %) ks)))
         (double (count ks))))))

(defn search-events
  "Tool-events that came from a search tool, in call order. All search
  variants register under the one `\"search\"` tool-name. Public so the
  per-turn attribution layer pairs it with [[unproductive-search-marks]]."
  [normalized]
  (filter #(= "search" (:function %)) (:tool-events normalized)))

(defn- result-id-set
  "The `[type id-str]` set a search call surfaced, read off its
  entity-usage `:output` refs."
  [search-event]
  (into #{} (map (fn [r] [(:type r) (str (:id r))])) (:output search-event)))

(defn- jaccard
  "Jaccard similarity `|A ∩ B| / |A U B|` of two sets. `0.0` when both are
  empty — two searches that surfaced nothing share no rediscovered result."
  ^double [a b]
  (let [union (count (set/union a b))]
    (if (zero? union)
      0.0
      (/ (double (count (set/intersection a b))) (double union)))))

(defn unproductive-search-marks
  "Mark each search call unproductive when its result-id set overlaps any
  prior call's at or above [[constants/jaccard-threshold]]. Takes the
  search tool-events in call order and returns a vector aligned to it:

  ```clojure
  [{:event <tool-event> :unproductive? Boolean :overlapping [<prior-event>...]}
   ...]
  ```

  The first call is never unproductive (no prior to overlap). Public so
  the per-turn attribution layer can reuse the same determination and
  back-reference the overlapped calls."
  [search-evs]
  (let [id-sets (mapv result-id-set search-evs)]
    (into []
          (map-indexed
           (fn [i ev]
             (let [cur     (nth id-sets i)
                   overlap (->> (range i)
                                (filter #(>= (jaccard cur (nth id-sets %))
                                             constants/jaccard-threshold))
                                (mapv #(nth search-evs %)))]
               {:event         ev
                :unproductive? (boolean (seq overlap))
                :overlapping   overlap})))
          search-evs)))

(defn- search-efficiency
  "Health in `[0, 1]` (1 = good): `1 -` the fraction of search calls that
  rediscovered an earlier call's results. `:na` with fewer than two search
  calls — a single search can't rediscover anything."
  [normalized]
  (let [evs (search-events normalized)]
    (if (< (count evs) 2)
      :na
      (- 1.0 (/ (double (count (filter :unproductive? (unproductive-search-marks evs))))
                (double (count evs)))))))

(defn compute
  "Pure conversation metrics. `normalized` is the struct from
  [[metabase.metabot.quality.extract/normalize]] with `:temporal`
  populated by [[metabase.metabot.quality.temporal/derive]].

  Returns a map of metric keyword → health-in-`[0, 1]`-or-`:na`, plus the
  raw execution inputs the subscore layer composes."
  [normalized governance]
  {:canonical-source-share (canonical-source-share normalized governance)
   :search-efficiency      (search-efficiency normalized)
   :grounded-source-share  (grounded-source-share normalized)
   :tool-call-failure-rate (tool-call-failure-rate normalized)
   :termination-health     (termination-health normalized)
   :artifact-validity-share (artifact-validity-share normalized)})

(comment
  ;; Healthy: a canonical authored source, grounded, no errors, clean exit.
  (compute {:sets        {:Q {["card" "1"] {}} :D {} :I {} :H {}}
            :tool-events []
            :temporal    {:terminal-state :final_response}}
           {["card" "1"] {:kind :card :moderation-status "verified"}})

  ;; Repeated identical searches drag search efficiency; forced exit.
  (compute {:sets        {:Q {} :D {["card" "1"] {}} :I {} :H {}}
            :tool-events [{:function "search" :output [{:type "card" :id 1}]}
                          {:function "search" :output [{:type "card" :id 1}]}]
            :temporal    {:terminal-state :iter_cap}}
           {["card" "1"] {:kind :card :moderation-status "verified"}}))
