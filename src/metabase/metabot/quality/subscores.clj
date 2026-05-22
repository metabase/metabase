(ns metabase.metabot.quality.subscores
  "Layer 4 of the conversation-quality pipeline: group the six concern
  signals into A/B/C/D subscores and combine into a single composite.

  See `notes/bot-1569/quality-score-impl.md` §F for the contract. Pure
  given the normalized struct (with `:temporal` populated) and the
  concern-signals map returned by
  [[metabase.metabot.quality.concern-signals/compute]].

  Subscore membership:

  | Subscore | Concern signals                         | N/A precondition                                                       |
  |----------|------------------------------------------|------------------------------------------------------------------------|
  | A        | selection-quality, grounding             | `|CONV_Q| = 0` AND no `:authoring` event ever fired                    |
  | B        | discovery-efficiency                     | `|CONV_D_non_field| = 0` (field-only enumeration is not real discovery)|
  | C        | execution-health                         | (always applicable)                                                    |
  | D        | conversational-economy, termination      | (always applicable)                                                    |

  Within-subscore composition is the arithmetic mean of `(1 − signal_i)`
  across the concern signals in that subscore — each subscore lands in
  `[0, 1]` with `1 = healthy`.

  Across-subscore composition is the geometric mean over non-N/A
  subscores: `(∏ Sᵢ)^(1/n)`. Weakest-link dominates — a single bad
  subscore craters the composite.

  Two conventions worth flagging:

  - **`artifact-intended?` is read from `:tool-events`, not from the
    profile** (per the strategy doc). A conversation that called an
    authoring tool with bad args yields `|CONV_Q| = 0` but Subscore A
    *applies* because the user wanted an artifact and the signals
    correctly reflect the failure. The N/A path is reserved for
    conversations that genuinely had no authoring intent.

  - **Subscore B's N/A precondition uses `|CONV_D_non_field|`, not
    `|CONV_D|`.** The Discovery-efficiency signal filters field-type
    atoms out of its denominator (Phase 2 follow-up #2); the N/A
    precondition mirrors that so a conversation that only enumerated
    fields under a known table doesn't get a spurious `Subscore B =
    1.0` against an effectively empty discovery set."
  (:require
   [metabase.metabot.quality.constants :as constants]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; N/A preconditions
;;; ---------------------------------------------------------------------------

(defn- authoring-event?
  [event]
  (= :authoring (:tool-type event)))

(defn- artifact-intended?
  "True iff the conversation has any CONV_Q members or any `:authoring`
  tool-event. Derived from the trajectory, not the profile."
  [normalized]
  (or (seq (get-in normalized [:sets :Q]))
      (some authoring-event? (:tool-events normalized))))

(defn- subscore-A-na?
  "Subscore A is N/A iff no artifact was intended at all."
  [normalized]
  (not (artifact-intended? normalized)))

(defn- field-atom?
  [atom-rec]
  (= "field" (:type atom-rec)))

(defn- subscore-B-na?
  "Subscore B is N/A iff CONV_D has no non-field entries. Matches
  Discovery-efficiency's field-filter — `every?` on an empty seq is
  vacuously true, so a fully-empty CONV_D and a field-only CONV_D both
  flip to N/A."
  [normalized]
  (every? field-atom? (vals (get-in normalized [:sets :D]))))

;;; ---------------------------------------------------------------------------
;;; Within-subscore composition
;;; ---------------------------------------------------------------------------

(defn- mean-of-healths
  "Arithmetic mean of `(1 − signal_i)` across the signals in this
  subscore. Each input ∈ `[0, 1]`; result ∈ `[0, 1]`, `1 = healthy`.
  Defensive `1.0` on an empty input — no caller passes empty, but the
  branch keeps the function total."
  ^double [signal-values]
  (let [n (count signal-values)]
    (if (zero? n)
      1.0
      (let [healths (map (fn [s] (- 1.0 (double s))) signal-values)]
        (/ (double (reduce + 0.0 healths))
           (double n))))))

(defn- subscore-A
  ^double [signals]
  (mean-of-healths [(:selection-quality signals)
                    (:grounding signals)]))

(defn- subscore-B
  ^double [signals]
  (mean-of-healths [(:discovery-efficiency signals)]))

(defn- subscore-C
  ^double [signals]
  (mean-of-healths [(:execution-health signals)]))

(defn- subscore-D
  ^double [signals]
  (mean-of-healths [(:conversational-economy signals)
                    (:termination signals)]))

;;; ---------------------------------------------------------------------------
;;; Composite
;;; ---------------------------------------------------------------------------

(defn- geometric-mean
  "Geometric mean of a seq of non-N/A subscores. `(∏ Sᵢ)^(1/n)`. Each
  input ∈ `[0, 1]`. Returns `1.0` on an empty input — defensive only,
  since C and D always apply so this path is unreachable in production."
  ^double [subscores]
  (let [n (count subscores)]
    (if (zero? n)
      1.0
      (Math/pow (reduce * 1.0 (map double subscores))
                (/ 1.0 (double n))))))

;;; ---------------------------------------------------------------------------
;;; Public surface
;;; ---------------------------------------------------------------------------

(defn compose
  "Group concern signals into A/B/C/D subscores and produce the composite.

  Returns:

  ```clojure
  {:A         Double-or-nil   ; nil if N/A
   :B         Double-or-nil   ; nil if N/A
   :C         Double
   :D         Double
   :composite Double
   :na        #{:A :B}}       ; subset of {:A :B}; C/D never N/A
  ```

  Pure — no I/O. `normalized` is the struct from
  [[metabase.metabot.quality.extract/normalize]] with `:temporal`
  populated by [[metabase.metabot.quality.temporal/derive]];
  `concern-signals` is the map from
  [[metabase.metabot.quality.concern-signals/compute]]."
  [normalized concern-signals]
  (let [a-na?  (subscore-A-na? normalized)
        b-na?  (subscore-B-na? normalized)
        a      (when-not a-na? (subscore-A concern-signals))
        b      (when-not b-na? (subscore-B concern-signals))
        c      (subscore-C concern-signals)
        d      (subscore-D concern-signals)
        active (cond-> [c d]
                 (some? a) (conj a)
                 (some? b) (conj b))
        na     (cond-> #{}
                 a-na? (conj :A)
                 b-na? (conj :B))]
    {:A         a
     :B         b
     :C         c
     :D         d
     :composite (geometric-mean active)
     :na        na}))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Healthy conversation — every signal zero → every subscore 1.0 → composite 1.0
  (compose {:sets {:P {} :D {} :Q {} :I {} :H {}}
            :tool-events []
            :temporal {:terminal-state :final_response}}
           {:selection-quality 0.0 :grounding 0.0 :discovery-efficiency 0.0
            :execution-health 0.0 :conversational-economy 0.0 :termination 0.0})

  ;; Authoring intended but Subscore B N/A (no real discovery)
  (compose {:sets {:Q {["card" "1"] {:type "card" :id 1 :id-str "1"}} :D {} :P {} :I {} :H {}}
            :tool-events [{:tool-type :authoring}]
            :temporal {:terminal-state :final_response}}
           {:selection-quality 0.0 :grounding 0.0 :discovery-efficiency 0.0
            :execution-health 0.0 :conversational-economy 0.0 :termination 0.0})

  ;; Termination cratered (e.g. iter-cap) — D = 0.5, composite drops
  (compose {:sets {:P {} :D {} :Q {} :I {} :H {}}
            :tool-events []
            :temporal {:terminal-state :iter_cap}}
           {:selection-quality 0.0 :grounding 0.0 :discovery-efficiency 0.0
            :execution-health 0.0 :conversational-economy 0.0 :termination 1.0})

  ;; Use constants in a REPL spelunk
  constants/composite-version)
