(ns metabase.metabot.quality.temporal
  "Layer 2 of the conversation-quality pipeline: temporal derivations over
  the normalized struct produced by [[metabase.metabot.quality.extract/normalize]].

  See `notes/bot-1569/quality-score-impl.md` §D for the contract. The
  layer is pure — given the normalized struct it returns the same struct
  enriched with two additions:

  - `:t-first-used` populated on each CONV_Q atom record (`extract.clj`
    leaves it `nil`).
  - A new top-level `:temporal` block with `:iterations`,
    `:thrash-events`, `:rediscovery-r`, `:errors-resolved-rate`, and
    `:terminal-state`.

  Conventions worth keeping in mind:

  - **JSON round-trip.** Message-row `:data` parts come back through
    `mi/transform-json`, so part `:type` values are *strings*
    (`\"data\"`, `\"tool-input\"`, ...) and map keys are keywords. A
    persisted `terminal_state` data part reads back as
    `{:type \"data\" :data-type \"terminal_state\" :data {:reason \"iter_cap\"}}`.

  - **Errors-resolved-rate target rule.** §D mentions \"same-function +
    same-target matching\" but doesn't define `target` per tool. The MVP
    rule is **same-function only**: the next call to the same function
    is the next attempt; if it succeeded the error is resolved. Reusing
    this layer's thrash threshold to also gate on argument similarity is
    a reasonable Phase 5 refinement once we see calibration data.

  - **Re-discovery clustering.** Search-tool query strings are clustered
    by *transitive* similarity (connected components in a
    similar?-adjacency graph), not greedy single-link bucketing. The
    distinction matters when three queries form an A~B, B~C, A≁C chain:
    union-find puts all three in one cluster (the agent kept widening
    the search), greedy bucketing would create two."
  (:refer-clojure :exclude [derive])
  (:require
   [clojure.string :as str]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.quality.constants :as constants]
   [metabase.util.json :as json])
  (:import
   (org.apache.commons.text.similarity LevenshteinDistance)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; String similarity (normalized Levenshtein)
;;; ---------------------------------------------------------------------------

(def ^:private ^LevenshteinDistance lev-distance
  "Singleton unbounded `LevenshteinDistance` matcher. Constructed once at
  ns load so we don't pay JVM allocation cost per comparison."
  (LevenshteinDistance.))

(defn- safe-str ^String [x] (if (nil? x) "" (str x)))

(defn normalized-distance
  "Normalized Levenshtein distance in `[0, 1]`. Two empty strings
  collapse to `0.0` (perfectly identical); two strings of different
  lengths are normalized against the longer."
  [a b]
  (let [a (safe-str a)
        b (safe-str b)
        n (max (count a) (count b))]
    (if (zero? n)
      0.0
      (/ (double (.apply lev-distance ^String a ^String b))
         (double n)))))

(defn similarity
  "`1 − normalized-distance`. `1.0` = byte-for-byte identical."
  [a b]
  (- 1.0 (normalized-distance a b)))

(defn similar?
  "True if `a` and `b` are at or above the configured query-similarity
  threshold. Shared by thrash detection and re-discovery clustering;
  also re-used by Phase 7 attribution to identify rediscovery / thrash
  observables under the same threshold the signals were scored with."
  [a b]
  (>= (similarity a b) constants/query-similarity-threshold))

;;; ---------------------------------------------------------------------------
;;; t-first-used population
;;; ---------------------------------------------------------------------------

(defn- min-q-iteration
  "Min iteration across the atom's `:Q`-tagged provenance entries.
  Returns `nil` if the atom isn't a CONV_Q member or none of its Q
  provenance entries carry an iteration."
  [atom-rec]
  (let [iters (for [{prov-set :set :keys [iteration]} (:provenance atom-rec)
                    :when (= :Q prov-set)
                    :when (some? iteration)]
                iteration)]
    (when (seq iters) (apply min iters))))

(defn- populate-t-first-used
  "Walk CONV_Q atoms and set each one's `:t-first-used`. Non-Q sets are
  left untouched — by contract `:t-first-used` is only meaningful for
  atoms that the agent actually authored against."
  [sets]
  (update sets :Q
          (fn [q-map]
            (reduce-kv (fn [acc k atom-rec]
                         (assoc acc k (assoc atom-rec :t-first-used (min-q-iteration atom-rec))))
                       {}
                       q-map))))

;;; ---------------------------------------------------------------------------
;;; Iteration count
;;; ---------------------------------------------------------------------------

(defn- compute-iterations
  "Total iteration count for the conversation. `(inc (max iteration-index))`
  per the impl plan; defaults to `0` for an empty tool-events stream so
  pre-foundation conversations don't crash here."
  [tool-events]
  (let [iters (keep :iteration-index tool-events)]
    (if (seq iters)
      (inc (apply max iters))
      0)))

;;; ---------------------------------------------------------------------------
;;; Argument serialization (shared by thrash + same-function lookups)
;;; ---------------------------------------------------------------------------

(defn- args->string
  "Serialize a tool-event's `:arguments` map to a stable string for
  similarity comparison. JSON-encode in the happy path; fall back to
  `pr-str` if the map carries something JSON can't handle (rare —
  arguments come from LLM JSON in the first place)."
  [args]
  (try (json/encode args)
       (catch Exception _ (pr-str args))))

;;; ---------------------------------------------------------------------------
;;; Thrash detection
;;; ---------------------------------------------------------------------------

(defn thrash-pair?
  "True if two adjacent tool-events represent a thrash — same function
  name, arguments above the similarity threshold. Skips events with
  `nil` `:function` (unknown / orphan tool-input) so they never trip
  the rule. Also re-used by Phase 7 attribution to fire the
  `thrash-event` observable on the second-in-pair turn."
  [a b]
  (and (some? (:function a))
       (= (:function a) (:function b))
       (similar? (args->string (:arguments a))
                 (args->string (:arguments b)))))

(defn- compute-thrash-events
  "Count adjacent same-function tool-event pairs with similar arguments
  in the flat `:tool-events` stream. Adjacency is taken globally
  (rather than restricted to within one iteration) so a re-invocation
  separated only by a single text part still counts."
  [tool-events]
  (->> tool-events
       (partition 2 1)
       (filter (fn [[a b]] (thrash-pair? a b)))
       count))

;;; ---------------------------------------------------------------------------
;;; Re-discovery clustering
;;; ---------------------------------------------------------------------------

(def search-tools-set
  "Tool-name strings classified as search calls for re-discovery counting.
  All four search-tool variants (`search`, `sql_search`, `nlq_search`,
  `transform_search`) register under the same `:tool-name` `\"search\"`
  in `metabase.metabot.tools.search`, so a single entry suffices. Public
  so the Phase 7 attribution layer can identify search calls under the
  same membership rule the signals were scored with."
  #{"search"})

(defn search-query-string
  "Project a search tool's `:arguments` to the text that uniquely
  identifies the query for clustering. Prefer `:keyword_queries` (the
  field every search variant accepts); fall back to whole-args
  serialization."
  [args]
  (if-let [kws (:keyword_queries args)]
    (str/join " " (map safe-str kws))
    (args->string args)))

(defn connected-components
  "Transitive clustering by union-find. Given a vector of items and a
  `pair-similar?` predicate, return a seq of seqs of indices where each
  inner seq is one connected component (any two indices in the same
  component are reachable through a chain of pairwise-similar items).

  `O(n²)` in the number of items, which is fine for the small search-
  call counts we see per conversation (<20). Public so the Phase 7
  attribution layer can re-cluster search calls without duplicating the
  union-find."
  [items pair-similar?]
  (let [n      (count items)
        parent (int-array n)]
    (dotimes [i n] (aset parent (int i) (int i)))
    (letfn [(find-root [^long x]
              (loop [x (int x)]
                (let [p (aget parent x)]
                  (if (= p x) x (recur (int p))))))
            (union! [^long a ^long b]
              (let [ra (find-root a)
                    rb (find-root b)]
                (when (not= ra rb)
                  (aset parent (int ra) (int rb)))))]
      (doseq [i (range n)
              j (range (inc i) n)]
        (when (pair-similar? (nth items i) (nth items j))
          (union! i j)))
      (vals (group-by find-root (range n))))))

(defn- compute-rediscovery-r
  "`r = N_search − N_clusters`. Counts each search call that duplicates
  an earlier one — five identical searches yield `r = 4`. Returns `0`
  when there are zero or one search calls (no possibility of
  rediscovery)."
  [tool-events]
  (let [queries (->> tool-events
                     (filter #(contains? search-tools-set (:function %)))
                     (mapv (comp search-query-string :arguments)))
        n       (count queries)]
    (if (<= n 1)
      0
      (let [clusters (connected-components queries similar?)]
        (- n (count clusters))))))

;;; ---------------------------------------------------------------------------
;;; Errors-resolved-on-next-attempt rate
;;; ---------------------------------------------------------------------------

(defn- errored? [event] (some? (:error event)))

(defn- compute-errors-resolved-rate
  "For each errored tool-event, scan forward through the stream until the
  next call to the same `:function`. If that call succeeded, the error
  is resolved. Rate = `resolved / errored`.

  Returns `nil` when no tool-events errored — the metric has no signal
  on a clean conversation, and `nil` is what Phase 5's execution-health
  uses to skip the `u` boost (treating `u = 1` would over-penalize)."
  [tool-events]
  (let [events  (vec tool-events)
        n       (count events)
        errored (vec (keep-indexed (fn [i e] (when (errored? e) i)) events))]
    (when (seq errored)
      (let [resolved
            (count (filter (fn [i]
                             (let [f (:function (events i))]
                               (loop [j (inc i)]
                                 (cond
                                   (>= j n)                            false
                                   (= f (:function (events j)))        (not (errored? (events j)))
                                   :else                               (recur (inc j))))))
                           errored))]
        (double (/ resolved (count errored)))))))

;;; ---------------------------------------------------------------------------
;;; Terminal-state classification
;;; ---------------------------------------------------------------------------

(def ^:private known-terminal-states
  "Categoricals the `terminal_state` data part legally projects to. Any
  reason outside this set falls through to `:error` — the conservative
  classification for concern signal 6 (Termination)."
  #{:model_signaled_done :final_response :iter_cap :error})

(defn- reason-from-terminal-state-part
  "Find the `terminal_state` data part on an assistant row's `:data` and
  project its `:reason` string to a categorical keyword. Returns `nil`
  when no `terminal_state` part is present.

  Each part comes back from `mi/transform-json` with string `:type` and
  string `:data-type`; the inner `:data` map's keys are keywords but
  its `:reason` value stays a string."
  [row]
  (when-let [reason-str
             (some (fn [part]
                     (when (and (= "data" (:type part))
                                (= streaming/terminal-state-type (:data-type part)))
                       (some-> part :data :reason)))
                   (:data row))]
    (let [k (keyword reason-str)]
      (if (contains? known-terminal-states k) k :error))))

(defn- last-assistant-row
  "Last assistant row in chronological order. The normalized struct's
  `:messages` is already sorted by `(created_at, id)`."
  [messages]
  (last (filter #(= :assistant (:role %)) messages)))

(defn- compute-terminal-state
  "Project the conversation's exit condition onto the §D categorical.
  Priority order:

  1. `terminal_state` data part on the last assistant row →
     `:model_signaled_done | :final_response | :iter_cap | :error`
  2. `metabot_message.error` non-nil → `:error`
  3. `metabot_message.finished = false` → `:aborted` (recorded as a
     distinct value; Phase 5's concern signal 6 collapses it to error)
  4. Default → `:model_signaled_done`

  Returns `:model_signaled_done` for conversations with no assistant
  row at all — degenerate but harmless (the temporal layer is pure and
  must not throw on edge shapes)."
  [messages]
  (let [row (last-assistant-row messages)]
    (cond
      (nil? row)
      :model_signaled_done

      (some? (reason-from-terminal-state-part row))
      (reason-from-terminal-state-part row)

      (some? (:error row))
      :error

      (false? (:finished row))
      :aborted

      :else
      :model_signaled_done)))

;;; ---------------------------------------------------------------------------
;;; Public surface
;;; ---------------------------------------------------------------------------

(defn derive
  "Layer 2 enrichment. Given a normalized struct from `extract/normalize`,
  return the same struct with `:t-first-used` populated on each CONV_Q
  atom record and a new `:temporal` block per the §D contract:

  ```clojure
  {:iterations           Long
   :thrash-events        Long
   :rediscovery-r        Long
   :errors-resolved-rate Double-or-nil
   :terminal-state       Keyword}
  ```"
  [{:keys [messages tool-events sets] :as normalized}]
  (assoc normalized
         :sets     (populate-t-first-used sets)
         :temporal {:iterations           (compute-iterations tool-events)
                    :thrash-events        (compute-thrash-events tool-events)
                    :rediscovery-r        (compute-rediscovery-r tool-events)
                    :errors-resolved-rate (compute-errors-resolved-rate tool-events)
                    :terminal-state       (compute-terminal-state messages)}))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Round-trip an extract output through derive — verify the :temporal block
  ;; lands and Q-atom :t-first-used is populated.
  (require '[metabase.metabot.quality.extract :as extract])
  (-> (extract/normalize [])
      derive
      :temporal)

  ;; Eyeball the cluster behavior on a hand-crafted query list.
  (connected-components ["orders" "orders 2023" "products"] similar?))
