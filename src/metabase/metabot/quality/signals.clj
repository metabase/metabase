(ns metabase.metabot.quality.signals
  "Per-signal magnitude predicates for the BOT-1515 conversation quality
  composite. Each public fn `<name>-magnitude` takes the normalized
  conversation shape produced by `quality.extract/normalize` (and, for the
  retrieval-discipline family, the canonical-rank map produced by
  `quality.governance/resolve-canonical-rank`) and returns a non-negative
  number — either an event count or a raw metric value. Baseline subtraction
  for `:excess` signals happens later in `quality.compose/signal-contribution`,
  not here.

  Four signal families:
    1. Retrieval discipline — canonical-bypass, canonical-ignored,
       search-ignored, author-without-inspect.
    2. Iteration — iter-cap-burned.
    3. Per-turn efficiency — turn-thrash, n-expensive-turn, query-thrash.
    4. Failure outcomes — tool-error-magnitude, turn-broken."
  (:require
   [metabase.metabot.quality.constants :as constants]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Shared helpers
;; ---------------------------------------------------------------------------

(defn- ref-key
  "Lookup key into the canonical-rank map: `[ref-type ref-id]`."
  [r]
  [(:ref-type r) (:ref-id r)])

(def ^:private bridgeable-card-types
  "Search hits and inspect/author/navigate refs all live in the same id space,
  but `{{#N}}` template refs surface as `:card` while the matching search/inspect
  entity may carry the resolved subtype (`:question`/`:model`/`:metric`). The
  card-bridge rule treats those as equivalent for entity matching."
  #{:question :model :metric})

(defn- card-bridge-match?
  "Card-bridge entity-match rule. Same id AND either (a) ref-types are
  identical or (b) one side is `:card` and the other is in
  `bridgeable-card-types`. Symmetric — either direction satisfies the bridge."
  [a b]
  (and (= (:ref-id a) (:ref-id b))
       (let [t1 (:ref-type a) t2 (:ref-type b)]
         (or (= t1 t2)
             (and (= :card t1) (contains? bridgeable-card-types t2))
             (and (= :card t2) (contains? bridgeable-card-types t1))))))

(defn- after?
  "Strict `:order-key` ordering — `:order-key` is `[created-at id part-index]`
  (extract.clj) so the default `compare` does lex order, equivalent to
  `(later.created_at, later.part_index) > (earlier.created_at,
  earlier.part_index)`."
  [later earlier]
  (pos? (compare (:order-key later) (:order-key earlier))))

(defn- earliest-order-key
  "Smallest `:order-key` among `refs`, or nil if empty. `sort` uses Clojure's
  default `compare` which works on the order-key vectors produced by
  `extract.clj`."
  [refs]
  (some->> refs seq (map :order-key) sort first))

(defn- engagement-refs
  "Concat of the three engagement ref kinds — inspect, author, navigate. Used
  by the canonical-ignored and search-ignored predicates."
  [normalized]
  (let [er (:entity-refs normalized)]
    (concat (:inspect-refs er) (:author-refs er) (:navigate-refs er))))

;; ---------------------------------------------------------------------------
;; Family 1 — Retrieval discipline
;; ---------------------------------------------------------------------------

(defn canonical-bypass-magnitude
  "Count of authoring tool calls whose target entity is `:non-canonical` *and*
  whose order-key strictly follows the earliest canonical search hit in the
  conversation. Dashboards / databases / transforms resolve to `:unknown`
  upstream and so are excluded from the count by construction."
  [normalized canonical-map]
  (let [search-hits     (get-in normalized [:entity-refs :search-hits])
        author-refs     (get-in normalized [:entity-refs :author-refs])
        canonical-hits  (filter #(= :canonical (get canonical-map (ref-key %))) search-hits)
        first-canonical (earliest-order-key canonical-hits)]
    (if (nil? first-canonical)
      0
      (count
       (filter (fn [ar]
                 (and (= :non-canonical (get canonical-map (ref-key ar)))
                      (pos? (compare (:order-key ar) first-canonical))))
               author-refs)))))

(defn canonical-ignored-magnitude
  "Distinct count of `(entity-type, entity-id)` pairs that appear as canonical
  search hits but have no engagement (inspect/author/navigate) strictly after
  the earliest hit for that entity. Engagement uses the card-bridge rule."
  [normalized canonical-map]
  (let [search-hits    (get-in normalized [:entity-refs :search-hits])
        engagements    (engagement-refs normalized)
        canonical-hits (filter #(= :canonical (get canonical-map (ref-key %))) search-hits)]
    (->> (group-by ref-key canonical-hits)
         (filter (fn [[_k hits]]
                   (let [earliest (earliest-order-key hits)
                         exemplar (first hits)]
                     (not-any? (fn [e]
                                 (and (card-bridge-match? e exemplar)
                                      (pos? (compare (:order-key e) earliest))))
                               engagements))))
         count)))

(defn search-ignored-magnitude
  "Count of search calls whose returned entities all had zero subsequent
  engagement. Rolled up per search call (by `:order-key`), not per entity.
  Calls with no `:search-hits` (e.g. zero-entity results) are not counted —
  `extract` only surfaces hits when `:structured-output.data` is non-empty,
  which is the natural reading of 'a wasted search returned things the agent
  failed to use'."
  [normalized _canonical-map]
  (let [search-hits (get-in normalized [:entity-refs :search-hits])
        engagements (engagement-refs normalized)]
    (->> (group-by :order-key search-hits)
         (filter (fn [[call-ok hits]]
                   (not-any? (fn [hit]
                               (some (fn [e]
                                       (and (card-bridge-match? e hit)
                                            (pos? (compare (:order-key e) call-ok))))
                                     engagements))
                             hits)))
         count)))

(def ^:private author-without-inspect-types
  "Database / dashboard / transform refs don't have a meaningful 'inspect'
  counterpart in the tool registry and are excluded from this signal."
  #{:table :model :metric :question :card})

(defn author-without-inspect-magnitude
  "Count of authoring refs (of a classifiable ref-type) that have no
  card-bridge-matching inspect ref earlier in the conversation."
  [normalized _canonical-map]
  (let [author-refs  (get-in normalized [:entity-refs :author-refs])
        inspect-refs (get-in normalized [:entity-refs :inspect-refs])]
    (count
     (filter (fn [ar]
               (and (contains? author-without-inspect-types (:ref-type ar))
                    (not-any? (fn [ir]
                                (and (card-bridge-match? ir ar)
                                     (after? ar ir)))
                              inspect-refs)))
             author-refs))))

;; ---------------------------------------------------------------------------
;; Family 2 — Iteration
;; ---------------------------------------------------------------------------

(defn iter-cap-burned-magnitude
  "Count of assistant messages whose `:iter-count` is at or above the per-row
  profile's max-iterations cap.

  Per-message profile lookup: each row is judged against the cap it was
  actually permitted (e.g. transforms_codegen at 30, internal at 10) so a
  mixed-profile conversation isn't mis-flagged by a modal profile choice.

  The `pos? iter` guard excludes turns with no LLM parts. A row whose
  `profile_id` is missing from `profile-max-iterations` contributes 0
  (permissive fallback)."
  [normalized]
  (->> (:messages normalized)
       (filter #(= :assistant (:role %)))
       (filter (fn [msg]
                 (let [cap  (get constants/profile-max-iterations (:profile-id msg))
                       iter (or (:iter-count msg) 0)]
                   (and (some? cap)
                        (pos? iter)
                        (>= iter cap)))))
       count))

;; ---------------------------------------------------------------------------
;; Family 3 — Per-turn efficiency
;; ---------------------------------------------------------------------------

(defn- assistant-messages
  [normalized]
  (filter #(= :assistant (:role %)) (:messages normalized)))

(defn turn-thrash-magnitude
  "Σ over assistant turns of `max(0, n_data_retrieval(T) - turn-thrash-baseline)`.

  Pre-aggregated excess: per-turn baseline subtraction happens here rather than
  in `quality.compose/signal-contribution`. The signal is registered as
  `:kind :event-count` in `constants/signal-params` for that reason — the
  magnitude returned here is already post-baseline, and `signal-contribution`
  just multiplies by `k`."
  [normalized]
  (transduce
   (map (fn [m]
          (let [n (count (filter #(contains? constants/data-retrieval-tools (:function %))
                                 (:tool-calls m)))]
            (max 0 (- n constants/turn-thrash-baseline)))))
   +
   0
   (assistant-messages normalized)))

(defn n-expensive-turn-magnitude
  "Corpus-relative outlier count. Counts assistant turns whose `:total-tokens`
  exceeds the per-deployment outlier `threshold` produced by
  `quality.corpus-stats/outlier-threshold` (median + (Z / scale) × MAD).

  `threshold` is nil-safe: when nil — the corpus is below
  `constants/min-corpus-size` or callers omit the value — the signal
  contributes 0. This keeps the signal silent on fresh deployments instead
  of flagging every turn as 'above zero.'"
  [normalized threshold]
  (if (nil? threshold)
    0
    (let [t (double threshold)]
      (->> (assistant-messages normalized)
           (filter (fn [m] (> (double (or (:total-tokens m) 0)) t)))
           count))))

(defn- query-id-for-event
  "Query-id resolution for an authoring tool call:
    edit_sql_query / replace_sql_query → `arguments.query_id`
    create_sql_query / construct_notebook_query / write_transform_* /
      document_construct_* → `result.structured-output.query-id`

  `:query-id` is in `metabot.persistence/persisted-structured-output-keys`,
  so the second branch survives the post-persistence shape unchanged. Authoring
  tools with no resolvable query-id (chart-only variants, for example) return
  nil and are dropped by the caller."
  [{:keys [function arguments result]}]
  (case function
    ("edit_sql_query" "replace_sql_query")
    (:query_id arguments)

    ("create_sql_query"
     "construct_notebook_query"
     "write_transform_sql"
     "write_transform_python"
     "document_construct_sql_chart"
     "document_construct_model_chart")
    (get-in result [:structured-output :query-id])

    nil))

(defn- in-window?
  "Half-open membership test for a `user-turn-window`: `start ≤ order-key < end`,
  with `nil end` meaning 'extends to the end of the conversation'.

  Compares on the `[ts id]` prefix of the event's `order-key` because window
  boundaries are length-2 (`ordered-key` from extract.clj) while events are
  length-3 (`[ts id part-idx]`). Clojure's vector compare is length-first when
  lengths differ, so we have to drop the part-index before comparing —
  otherwise every event compares 'greater' than every boundary regardless of
  its actual time/id, and events fall through to the last window.

  Since events come from assistant messages and boundaries come from user
  messages, the `[ts id]` prefixes never collide (a placeholder assistant row
  shares `:created_at` with its user prompt, but the row ids always differ)."
  [{:keys [start end]} order-key]
  (let [prefix (subvec order-key 0 2)]
    (and (not (neg? (compare prefix start)))
         (or (nil? end) (neg? (compare prefix end))))))

(defn query-thrash-magnitude
  "Raw max count of authoring tool calls within a single `(user-turn,
  query-id)` bucket. Baseline (2) subtraction happens in
  `quality.compose/signal-contribution`, so this returns the underlying count
  — `2` for a healthy create+fix, `3+` for the inflection into thrash.

  Authoring events that fall outside every user-turn window or have no
  resolvable query-id are dropped before bucketing."
  [normalized]
  (let [windows (:user-turn-windows normalized)
        events  (filter #(contains? constants/authoring-tools (:function %))
                        (:tool-events normalized))]
    (->> events
         (keep (fn [ev]
                 (when-let [qid (query-id-for-event ev)]
                   (when-let [win (some #(when (in-window? % (:order-key ev)) %)
                                        windows)]
                     [(:user-msg-id win) qid]))))
         frequencies
         vals
         (reduce max 0))))

;; ---------------------------------------------------------------------------
;; Family 4 — Failure outcomes
;; ---------------------------------------------------------------------------

(defn- error-present?
  "True iff `e` represents a real error payload. Mirrors the SQL `COALESCE(elem
  ->> 'error', '') <> ''` discriminator over the *decoded* shape extract.clj
  produces: nil, empty strings, and empty collections (`{}`, `[]`) read as
  'no error'; anything else is a real payload."
  [e]
  (cond
    (nil? e)    false
    (string? e) (not= "" e)
    (coll? e)   (boolean (seq e))
    :else       true))

(defn tool-error-magnitude
  "Count of tool-output parts whose sibling `error` field *or* nested
  `result.error` field carries a real payload. The two branches are ORed per
  tool call, so a result with both populated contributes 1, not 2 — this is
  one call that failed in two redundant ways, not two calls."
  [normalized]
  (->> (:tool-events normalized)
       (filter (fn [{:keys [result output-error]}]
                 (or (error-present? output-error)
                     (error-present? (:error result)))))
       count))

(defn turn-broken-magnitude
  "Count of message rows where `finished = false` OR `error IS NOT NULL`.

  `finished IS NULL` (in-flight placeholder or crashed-and-never-finalized
  row) contributes 0 — we deliberately do not couple the score to any
  wall-clock-relative interpretation of stale NULLs."
  [normalized]
  (->> (:messages normalized)
       (filter (fn [m]
                 (or (false? (:finished m))
                     (some? (:error m)))))
       count))
