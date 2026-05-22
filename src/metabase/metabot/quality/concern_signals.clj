(ns metabase.metabot.quality.concern-signals
  "Layer 3 of the conversation-quality pipeline: six concern-signal
  magnitudes in `[0, 1]`, where `0 = no signal` and `1 = max`.

  See `notes/bot-1569/quality-score-impl.md` §E for the contract. Each
  signal is a pure function of the normalized struct (with `:temporal`
  populated by [[metabase.metabot.quality.temporal/derive]]) plus the
  batched governance map (the same `{[type id-str] facts}` shape
  returned by [[metabase.metabot.quality.governance/resolve]]) and a
  function `ancestry-of` that maps a card-id to its source-card
  ancestor-id chain (see §C and the §E substitution-detection rule).

  Public entry point [[compute]] returns:

  ```clojure
  {:selection-quality      Double
   :grounding              Double
   :discovery-efficiency   Double
   :execution-health       Double
   :conversational-economy Double
   :termination            Double}
  ```

  Conventions worth keeping in mind:

  - **Governance lives in the param, not on atoms.** [[compute]]
    intentionally reads governance facts via `(get governance
    [type id-str])` rather than `(:governance atom-rec)`. This keeps
    the signal helpers oblivious to whether Phase 6's wire-up has
    `assoc-governance`'d the facts onto each atom — they read from the
    canonical source. Phase 7's attribution layer can still use the
    on-atom slot for debugging context.

  - **`ancestry-of` is a callback, not data.** Phase 6 will wrap
    [[metabase.metabot.quality.governance/walk-source-card-ancestry]] in
    `(memoize …)` and pass the memoized walker here so a deeply-nested
    model lineage shared across the conversation costs one query per
    distinct ancestor. Tests pass `(constantly [])` (no ancestry signal)
    or a fixed-stub map lookup for deterministic behavior.

  - **Asymmetric substitution rule for tables vs. cards.** The §E rule
    as written requires `Y.verified? = false` and `X.verified? = true`
    — but tables have no verification concept in Metabase's data model
    (moderation reviews are card-scoped). For tables, [[has-substitute?]]
    drops the verification predicates and matches on
    db-id + schema + name-similarity. Cards keep the strict rule. The
    asymmetry is documented at the call site; switching tables to the
    strict rule would effectively no-op the table half of anchoring
    default #7.

  - **X ≠ Y guarantee.** Substitution detection never matches an entity
    against itself. When the same entity is both surfaced and authored
    against (e.g. a database-listing call enumerates table T, then the
    agent uses T), its D-atom and Q-atom share the same governance row
    — name-similarity, db-id, and schema all trivially match. Cards are
    incidentally protected by the asymmetric verified? rule; tables
    rely on an explicit `atom-key` guard inside [[name-substitute]] and
    [[ancestral-substitute]]."
  (:require
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.temporal :as temporal]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Saturation helper
;;; ---------------------------------------------------------------------------

(defn- saturate
  "Map a non-negative count `x` to `x / (x + C)` ∈ `[0, 1)`. Returns
  `0.0` for `x = 0` (no signal) and approaches `1.0` as `x → ∞`. `C`
  controls the half-saturation point: at `x = C` the signal is `0.5`."
  ^double [x ^double C]
  (let [x (double x)]
    (if (zero? x)
      0.0
      (/ x (+ x C)))))

;;; ---------------------------------------------------------------------------
;;; Entity helpers
;;; ---------------------------------------------------------------------------

(def ^:private card-types
  "Card-flavored entity types — share the `report_card` row and the same
  governance facts shape."
  #{"card" "question" "model" "metric"})

(defn- card-type?  [t] (contains? card-types t))
(defn- table-type? [t] (= "table" t))
(defn- field-type? [t] (= "field" t))

(defn- atom-key [atom-rec] [(:type atom-rec) (:id-str atom-rec)])

(defn- gov
  "Look up governance facts for an atom-record from the conversation's
  governance map. Returns `nil` when the entity isn't in the appdb (or
  isn't in the governance vocabulary — `field`, `collection`, etc.)."
  [governance atom-rec]
  (get governance (atom-key atom-rec)))

(defn- coerce-id
  "Coerce an atom's `:id` to Long for the ancestry walker. Aggregation
  aliases and similar string ids that don't parse return `nil`, which
  short-circuits the caller."
  [id]
  (cond
    (integer? id) (long id)
    (string?  id) (try (Long/parseLong ^String id) (catch NumberFormatException _ nil))
    :else         nil))

;;; ---------------------------------------------------------------------------
;;; Substitution detection (Selection-quality, half 1)
;;; ---------------------------------------------------------------------------

(defn- name-similar?
  "True if `a-name` and `b-name` are within the configured substitution
  name-distance threshold. Empty / nil names never match (would otherwise
  trip on the empty-vs-empty `0.0` distance case)."
  [a-name b-name]
  (and (seq a-name)
       (seq b-name)
       (<= (temporal/normalized-distance a-name b-name)
           constants/substitution-name-distance-threshold)))

(defn- card-substitute-candidate?
  "True if X (a CONV_D atom) is a valid substitution candidate for Y (an
  unverified CONV_Q card-type atom): same type, same db-id, X verified,
  and similar name."
  [x-gov y-gov]
  (and (true? (:verified? x-gov))
       (= (:db-id x-gov) (:db-id y-gov))
       (name-similar? (:name x-gov) (:name y-gov))))

(defn- table-substitute-candidate?
  "True if X (a CONV_D atom) is a valid substitution candidate for Y (a
  CONV_Q table atom): same db-id, same schema, similar name. Tables
  have no verification concept in Metabase, so the verified? check is
  dropped here (per the ns docstring's asymmetric-rule note)."
  [x-gov y-gov]
  (and (= (:db-id x-gov)  (:db-id y-gov))
       (= (:schema x-gov) (:schema y-gov))
       (name-similar? (:name x-gov) (:name y-gov))))

(defn- name-substitute
  "First D atom of the same type as Y that is a valid substitution
  candidate for Y under the type-appropriate predicate, or nil. Returns
  the atom (not a boolean) so Phase 7 attribution can attach the
  canonical X to the observable.

  Excludes X = Y by atom-key. When the same entity is both surfaced
  (CONV_D) and authored against (CONV_Q), its D-atom and Q-atom share
  the governance row, which would otherwise trivially satisfy
  name-similarity + db-id + schema — a self-substitution false positive.
  Cards are also protected by the asymmetric verified? rule (Y must be
  unverified, X must be verified), but tables drop both predicates and
  rely on this guard."
  [y d-atoms governance]
  (let [y-gov   (gov governance y)
        y-type  (:type y)
        y-key   (atom-key y)
        pred    (cond
                  (card-type?  y-type) card-substitute-candidate?
                  (table-type? y-type) table-substitute-candidate?
                  :else                (constantly false))]
    (when y-gov
      (first (filter (fn [x]
                       (and (not= (atom-key x) y-key)
                            (= (:type x) y-type)
                            (when-let [x-gov (gov governance x)]
                              (pred x-gov y-gov))))
                     d-atoms)))))

(defn- ancestral-substitute
  "First D atom that is a verified model whose source-card ancestry
  includes Y, or nil. Applies to card-type Y only (the strategy-doc
  case where the agent authored against a base card while the canonical
  surface is a model layered on top of it).

  `ancestry-of` is called with the integer card-id of X; the returned
  ancestor list is integers. Y's id is coerced to Long for the
  membership check; non-numeric ids short-circuit to nil.

  Excludes X = Y by atom-key (defensive — `walk-source-card-ancestry`
  already seeds its visited-set with the starting card so a self-cycle
  cannot return, but the guard makes the no-self-match contract
  uniform across both substitute helpers)."
  [y d-atoms governance ancestry-of]
  (when (card-type? (:type y))
    (when-let [y-id (coerce-id (:id y))]
      (let [y-key (atom-key y)]
        (first (filter (fn [x]
                         (when (and (not= (atom-key x) y-key)
                                    (= "model" (:type x))
                                    (true? (:verified? (gov governance x))))
                           (when-let [x-id (coerce-id (:id x))]
                             (boolean (some #(= y-id %) (ancestry-of x-id))))))
                       d-atoms))))))

(defn find-substitute
  "Return the first CONV_D atom that qualifies as a canonical substitute
  for Y under the §E selection-quality substitution rule, or nil. Public
  so Phase 7 attribution can fire the `canonical-bypass` observable with
  a reference to the bypassed canonical surface. Composes
  name-similarity with ancestral-lineage; name-similarity wins when
  both fire (the more direct grounding)."
  [y d-atoms governance ancestry-of]
  (or (name-substitute y d-atoms governance)
      (ancestral-substitute y d-atoms governance ancestry-of)))

(defn- has-substitute?
  "Composite substitution check for Y across CONV_D — name-similarity OR
  ancestral lineage."
  [y d-atoms governance ancestry-of]
  (some? (find-substitute y d-atoms governance ancestry-of)))

(defn- substitution-candidates
  "Y-side filter: CONV_Q atoms eligible for substitution detection.
  Anchoring default #7 scopes this to cards + tables, plus the
  card-only `verified? = false` precondition."
  [normalized governance]
  (->> (vals (get-in normalized [:sets :Q]))
       (filter (fn [y]
                 (let [t   (:type y)
                       yg  (gov governance y)]
                   (cond
                     (card-type?  t) (and yg (false? (:verified? yg)))
                     (table-type? t) (some? yg)
                     :else           false))))))

(defn- substitution-count
  "Number of Y atoms in CONV_Q that have at least one D-side substitute."
  [normalized governance ancestry-of]
  (let [d-atoms    (vals (get-in normalized [:sets :D]))
        candidates (substitution-candidates normalized governance)]
    (count (filter (fn [y] (has-substitute? y d-atoms governance ancestry-of))
                   candidates))))

;;; ---------------------------------------------------------------------------
;;; Personal-collection fraction (Selection-quality, half 2)
;;; ---------------------------------------------------------------------------

(defn- personal-collection-fraction
  "Fraction of CONV_Q card-type atoms that live in personal collections.
  Tables don't have personal-collection placement, so they're excluded
  from both numerator and denominator. Returns `0.0` when no card-type
  CONV_Q atoms are present (no signal)."
  ^double [normalized governance]
  (let [q-cards (->> (vals (get-in normalized [:sets :Q]))
                     (filter (fn [a] (card-type? (:type a))))
                     (keep (fn [a] (when-let [g (gov governance a)] [a g]))))
        n       (count q-cards)]
    (if (zero? n)
      0.0
      (/ (double (count (filter (fn [[_ g]] (true? (:lives-in-personal? g))) q-cards)))
         (double n)))))

;;; ---------------------------------------------------------------------------
;;; Selection-quality
;;; ---------------------------------------------------------------------------

(defn- selection-quality
  "Mean of (saturated substitution count, personal-collection fraction).
  Both components ∈ `[0, 1]`."
  ^double [normalized governance ancestry-of]
  (let [s             (substitution-count normalized governance ancestry-of)
        sub-component (saturate s constants/C-substitution)
        pc-component  (personal-collection-fraction normalized governance)]
    (/ (+ sub-component pc-component) 2.0)))

;;; ---------------------------------------------------------------------------
;;; Grounding
;;; ---------------------------------------------------------------------------

(defn- grounding
  "Saturated count of CONV_H_ambiguous entries. The three-bucket variant
  treats CONV_H as the ambiguous bucket directly (anchoring default #8);
  free-form prompt-text extraction would move members from H into P
  without changing this formula."
  ^double [normalized]
  (let [h (count (get-in normalized [:sets :H]))]
    (saturate h constants/C-grounding)))

;;; ---------------------------------------------------------------------------
;;; Discovery-efficiency
;;; ---------------------------------------------------------------------------

(defn- non-field-atoms
  "CONV_D with `:field` entries filtered out. Fields are typically
  enumerated under a parent table by `list_available_fields` or
  `read_resource(metabase://table/N)` — not real \"agent told the LLM
  about this thing\" events for Discovery-efficiency. (Phase 2
  follow-up #2, resolved here.)"
  [normalized]
  (->> (vals (get-in normalized [:sets :D]))
       (remove (fn [a] (field-type? (:type a))))))

(defn- surfaced-but-unused-fraction
  "`|CONV_D_non_field \\ CONV_Q| / |CONV_D_non_field|`. Returns `0.0`
  when no non-field discovery happened — no surfacings means no waste."
  ^double [normalized]
  (let [d-atoms (non-field-atoms normalized)
        n       (count d-atoms)]
    (if (zero? n)
      0.0
      (let [q-keys (set (keys (get-in normalized [:sets :Q])))
            unused (count (remove (fn [a] (contains? q-keys (atom-key a))) d-atoms))]
        (/ (double unused) (double n))))))

(defn- min-rank
  "Lowest `:metadata.rank` across an atom's provenance entries. Returns
  `nil` if no provenance entry carries a numeric rank (e.g. surfaced
  by an inspection tool rather than search)."
  [atom-rec]
  (let [ranks (keep (fn [p] (get-in p [:metadata :rank])) (:provenance atom-rec))
        nums  (filter number? ranks)]
    (when (seq nums) (apply min nums))))

(defn- avg-rank-used-component
  "Average rank of non-field CONV_D atoms that were also used (∈ CONV_Q),
  normalized against [[constants/typical-search-result-length]] and
  clamped to `1.0`. Returns `0.0` when no overlap exists — without used
  surfacings the rank tells us nothing."
  ^double [normalized]
  (let [d-atoms (non-field-atoms normalized)
        q-keys  (set (keys (get-in normalized [:sets :Q])))
        used    (filter (fn [a] (contains? q-keys (atom-key a))) d-atoms)
        ranks   (keep min-rank used)]
    (if (empty? ranks)
      0.0
      (let [avg (/ (double (reduce + ranks)) (double (count ranks)))]
        (min 1.0 (/ avg (double constants/typical-search-result-length)))))))

(defn- discovery-efficiency
  "Mean of (surfaced-but-unused fraction, avg-rank-used component,
  saturated rediscovery count). All three ∈ `[0, 1]`."
  ^double [normalized]
  (let [r          (get-in normalized [:temporal :rediscovery-r] 0)
        unused-c   (surfaced-but-unused-fraction normalized)
        rank-c     (avg-rank-used-component normalized)
        rediscov-c (saturate r constants/C-rediscovery)]
    (/ (+ unused-c rank-c rediscov-c) 3.0)))

;;; ---------------------------------------------------------------------------
;;; Execution-health
;;; ---------------------------------------------------------------------------

(defn- execution-health
  "Floor-bounded boost: `p × (α + (1 − α) × u)` where `p` is the failure
  rate and `u = 1 − errors-resolved-rate` measures how persistent the
  failures were. `α` ([[constants/eh-mitigation-floor]]) keeps the floor
  non-zero so a clean conversation that errored once and recovered
  still contributes some signal.

  Returns `0.0` when the conversation has no tool events at all or when
  `errors-resolved-rate` is `nil` (= no errors occurred — `p` is `0`
  too, so this is just a fast-path)."
  ^double [normalized]
  (let [events  (:tool-events normalized)
        total   (count events)
        errored (count (filter (comp some? :error) events))
        rate    (get-in normalized [:temporal :errors-resolved-rate])]
    (cond
      (zero? total) 0.0
      (nil? rate)   0.0
      :else
      (let [p (/ (double errored) (double total))
            u (- 1.0 (double rate))]
        (* p (+ constants/eh-mitigation-floor
                (* (- 1.0 constants/eh-mitigation-floor) u)))))))

;;; ---------------------------------------------------------------------------
;;; Conversational-economy
;;; ---------------------------------------------------------------------------

(defn- iterations-per-artifact-component
  "Saturated excess over [[constants/target-iterations-per-artifact]].
  `|CONV_Q| = 0` falls back to `1` as the denominator (would otherwise
  divide by zero); the artifact-intended? gating in Subscore A catches
  the no-authoring case at a higher layer."
  ^double [normalized]
  (let [iters     (get-in normalized [:temporal :iterations] 0)
        artifacts (count (get-in normalized [:sets :Q]))
        ratio     (/ (double iters) (double (max 1 artifacts)))
        excess    (max 0.0 (- ratio constants/target-iterations-per-artifact))]
    (saturate excess constants/C-economy-iterations)))

(defn- thrash-component
  "Saturated thrash-event count from the temporal layer."
  ^double [normalized]
  (let [t (get-in normalized [:temporal :thrash-events] 0)]
    (saturate t constants/C-thrash)))

(defn- max-reuse-component
  "Max per-entity provenance-entry count across all sets (P/D/Q/I/H).
  Saturated above [[constants/target-max-entity-reuse]] — small reuse
  is normal (the LLM does a discovery hit and then authors against
  it); excess reuse signals the agent is reaching for the same entity
  over and over without progress."
  ^double [normalized]
  (let [all-atoms (mapcat vals (vals (:sets normalized)))
        reuses    (map (comp count :provenance) all-atoms)
        max-r     (if (seq reuses) (apply max reuses) 0)
        excess    (max 0 (- max-r constants/target-max-entity-reuse))]
    (saturate excess constants/C-reuse)))

(defn- conversational-economy
  "Mean of (iterations-per-artifact excess, thrash, max per-entity reuse
  excess). All three ∈ `[0, 1]`."
  ^double [normalized]
  (let [ipa-c   (iterations-per-artifact-component normalized)
        thr-c   (thrash-component normalized)
        reuse-c (max-reuse-component normalized)]
    (/ (+ ipa-c thr-c reuse-c) 3.0)))

;;; ---------------------------------------------------------------------------
;;; Termination
;;; ---------------------------------------------------------------------------

(def ^:private terminal-state->signal
  "Categorical mapping for concern signal 6 (Termination). `:aborted`
  collapses to `1.0` per the Phase 4 carry-forward — the user gave up
  before the agent committed, semantically equivalent to a termination
  failure for the purposes of this signal."
  {:model_signaled_done 0.0
   :final_response      0.0
   :iter_cap            1.0
   :error               1.0
   :aborted             1.0})

(defn- termination
  "Categorical signal driven by `(:temporal :terminal-state)`. Unknown /
  unexpected values fall through to `1.0` — defensive (an unknown
  terminal state is itself a termination problem)."
  ^double [normalized]
  (get terminal-state->signal
       (get-in normalized [:temporal :terminal-state])
       1.0))

;;; ---------------------------------------------------------------------------
;;; Public surface
;;; ---------------------------------------------------------------------------

(defn compute
  "Six concern-signal magnitudes ∈ `[0, 1]`. Returns a map keyed by
  signal name. Pure — no I/O.

  `normalized` is the struct returned by
  [[metabase.metabot.quality.extract/normalize]] with `:temporal`
  populated by [[metabase.metabot.quality.temporal/derive]].
  `governance` is the batched governance map (see
  [[metabase.metabot.quality.governance/resolve]]). `ancestry-of` is a
  function from `card-id` (Long) to a seq of ancestor card-ids; in
  Phase 6's wire-up it wraps a memoized
  [[metabase.metabot.quality.governance/walk-source-card-ancestry]]."
  [normalized governance ancestry-of]
  {:selection-quality      (selection-quality normalized governance ancestry-of)
   :grounding              (grounding normalized)
   :discovery-efficiency   (discovery-efficiency normalized)
   :execution-health       (execution-health normalized)
   :conversational-economy (conversational-economy normalized)
   :termination            (termination normalized)})

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Healthy fixture — all signals at zero.
  (compute {:sets     {:P {} :D {} :Q {} :I {} :H {}}
            :tool-events []
            :temporal {:iterations 0 :thrash-events 0 :rediscovery-r 0
                       :errors-resolved-rate nil :terminal-state :final_response}}
           {}
           (constantly []))

  ;; Worst-case-ish fixture — saturate every component.
  (compute {:sets     {:P {} :D {} :Q {} :I {}
                       :H (zipmap (range 20) (repeat {:type "card" :id-str "0" :provenance []}))}
            :tool-events (repeat 10 {:function "edit_sql_query" :arguments {} :error {:msg "x"}})
            :temporal {:iterations 30 :thrash-events 10 :rediscovery-r 10
                       :errors-resolved-rate 0.0 :terminal-state :iter_cap}}
           {}
           (constantly [])))
