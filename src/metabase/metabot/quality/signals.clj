(ns metabase.metabot.quality.signals
  "Per-signal magnitude predicates for the BOT-1515 conversation quality
  composite. Each public fn `<name>-magnitude` takes the normalized
  conversation shape produced by `quality.extract/normalize` (and, for the
  retrieval-discipline family, the canonical-rank map produced by
  `quality.governance/resolve-canonical-rank`) and returns a non-negative
  number — either an event count or a raw metric value. Baseline subtraction
  for `:excess` signals happens later in `quality.compose/signal-contribution`,
  not here.

  Phase 1E covers Family 1 (retrieval discipline) and Family 2 (iteration).
  Family 3 (per-turn efficiency) and Family 4 (failure outcomes) are added in
  Phase 1F.

  Cross-reference:
    - signal panel: notes/bot-1515-conversation-score/strategy-v3-signals-ref-v2.md §3
    - design: notes/bot-1515-conversation-score/impl-phase-1-conversation-composites.md §4.5"
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
  card-bridge rule (signals-ref §3.2) treats those as equivalent for entity
  matching."
  #{:question :model :metric})

(defn- card-bridge-match?
  "Card-bridge entity-match rule (signals-ref §3.2). Same id AND either
  (a) ref-types are identical or (b) one side is `:card` and the other is in
  `bridgeable-card-types`. Symmetric — either direction satisfies the bridge."
  [a b]
  (and (= (:ref-id a) (:ref-id b))
       (let [t1 (:ref-type a) t2 (:ref-type b)]
         (or (= t1 t2)
             (and (= :card t1) (contains? bridgeable-card-types t2))
             (and (= :card t2) (contains? bridgeable-card-types t1))))))

(defn- after?
  "Strict `:order-key` ordering — `:order-key` is `[created-at id part-index]`
  (extract.clj) so the default `compare` does lex order and matches the
  signals-ref temporal predicate `(later.created_at, later.part_index) >
  (earlier.created_at, earlier.part_index)`."
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
  "Signals-ref §3.1. Count of authoring tool calls whose target entity is
  `:non-canonical` *and* whose order-key strictly follows the earliest
  canonical search hit in the conversation. Dashboards / databases / transforms
  resolve to `:unknown` upstream and so are excluded from the count by
  construction."
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
  "Signals-ref §3.2. Distinct count of `(entity-type, entity-id)` pairs that
  appear as canonical search hits but have no engagement (inspect/author/
  navigate) strictly after the earliest hit for that entity. Engagement uses
  the card-bridge rule."
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
  "Signals-ref §3.3. Count of search calls whose returned entities all had zero
  subsequent engagement. Rolled up per search call (by `:order-key`), not per
  entity. Calls with no `:search-hits` (e.g. zero-entity results) are not
  counted — `extract` only surfaces hits when `:structured-output.data` is
  non-empty, which is the natural reading of 'a wasted search returned things
  the agent failed to use'."
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
  "Restriction from signals-ref §3.4. Database / dashboard / transform refs
  don't have a meaningful 'inspect' counterpart in the tool registry and are
  excluded from this signal."
  #{:table :model :metric :question :card})

(defn author-without-inspect-magnitude
  "Signals-ref §3.4. Count of authoring refs (of a classifiable ref-type) that
  have no card-bridge-matching inspect ref earlier in the conversation."
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
  "Signals-ref §3.5. Count of assistant messages whose `:iter-count` is at or
  above the per-row profile's max-iterations cap.

  **Per-message profile lookup**, deviating from strategy-v3's modal-profile
  rule per impl plan §9.7: each row is judged against the cap it was actually
  permitted (e.g. transforms_codegen at 30, internal at 10) so a mixed-profile
  conversation isn't mis-flagged.

  The `pos? iter` guard implements the strategy-v3 `recovery_quality = 'clean'`
  filter, excluding turns with no LLM parts (signals-ref §3.5).
  A row whose `profile_id` is missing from `profile-max-iterations` contributes
  0 (permissive fallback per signals-ref §2.5)."
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
