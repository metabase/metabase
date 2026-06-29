(ns metabase.agent-lib.representations.repair
  "Repair pass for LLM-authored representations queries.

  Works on the **string-keyed, portable** representations form -- i.e. the JSON body
  `metabase.agent-lib.representations/external-query->portable` produced from the LLM's
  external-query input, *before* it has been handed to the resolver. This is where we gently
  patch up the sort of shape drift that LLMs routinely produce:

    * missing `{}` options on clauses (LLMs forget to emit empty maps);
    * missing `\"lib/type\"` marker on stages, joins, and the top-level query;
    * stage / clause shape normalisations covering common LLM-authored variants
      (see the per-pass docstrings below).

  **Key invariant: idempotency.** Repair must be a fixed point under repeated application: for
  any repr `q`, `(repair q)` must equal `(repair (repair q))`. This is enforced by property test
  and by construction -- every pass is written as `when-something-is-missing, add it`, never as
  `rewrite what's there`.

  The repair pass does **not** do FK resolution (that's the resolver's job) and does **not**
  validate (that's `representations/validate-query`'s job). It runs *between* the JSON
  external-query → portable conversion and validate-and-resolve.

  ## Implicit joins

  In addition to the shape passes above, `repair` also runs an **implicit-join pass** that uses
  the caller's `MetadataProvider` to auto-wire `source-field` options on field clauses that
  reference a table other than the stage's `source-table`. That pass is the only reason `repair`
  takes an `mp` argument - the shape passes themselves don't need it."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.agent-lib.representations.resolve :as repr.resolve]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Pass 1 -- ensure every clause vector has an options map at position 2
;;; ============================================================

(defn- non-blank-string? [x]
  (and (string? x) (not= "" x)))

(defn- looks-like-fk-path?
  "An FK path is a vector of strings (possibly with `nil` for schema-less DBs) of length >= 3
  (`[db schema table]`) or >= 4 (`[db schema table col …]`). We use length >= 3 as the cutoff
  here to keep things safe -- shorter vectors of strings are probably not FK paths, they're more
  likely bare clauses like `[\"count\"]` that the LLM forgot to annotate."
  [v]
  (and (>= (count v) 3)
       (every? #(or (string? %) (nil? %)) v)))

(defn- clause-like?
  "Heuristic: a real clause vector (not a map entry, not an FK path) whose head is a non-blank
  operator string. We skip:

    * `map-entry?` values (postwalk descends into map entries; their shape is [k v] and our
      heuristic would otherwise misidentify them as bare clauses);
    * FK-paths of length >= 3 consisting entirely of strings and `nil`s (see
      [[looks-like-fk-path?]])."
  [v]
  (and (vector? v)
       (not (map-entry? v))
       (pos? (count v))
       (non-blank-string? (first v))
       (not (looks-like-fk-path? v))))

(defn- needs-options-map?
  "True if `v` is a clause-like vector whose position 2 is either missing or `nil`.

  IMPORTANT: we do NOT treat a non-nil non-map at position 2 as \"missing options\". That would be
  ambiguous -- position 2 might be a nested clause (`[\"=\", [\"field\", ...], 10]` where the LLM
  forgot the options on `=`), and replacing that nested clause with `{}` would silently drop
  data. Instead we only repair the two unambiguous cases:

    * clause too short (no position 2 at all): `[\"count\"]` -> `[\"count\" {}]`;
    * explicit nil at position 2: `[\"count\", nil]` -> `[\"count\" {}]`.

  For a clause like `[\"=\", [\"field\", ...], 10]` where the options slot holds another clause,
  we **insert** `{}` before the existing element (see [[insert-options-map]])."
  [v]
  (and (clause-like? v)
       (or (< (count v) 2)
           (nil? (nth v 1))
           ;; position 2 is present but not a map -- means the LLM skipped the options slot
           ;; entirely and the arg at position 1 is actually a term (nested clause or FK-path
           ;; vector or a scalar). In that case we need to insert, not replace.
           (not (map? (nth v 1))))))

(defn- insert-options-map
  "Given a clause-like vector missing its options map at position 2, produce a vector with `{}`
  there. Three cases:

    * `[op]` -> `[op {}]`
    * `[op nil …args]` -> `[op {} …args]`  (replace the nil placeholder)
    * `[op <non-nil-non-map> …args]` -> `[op {} <non-nil-non-map> …args]`  (insert, don't replace)"
  [v]
  (cond
    (< (count v) 2)           (conj v {})
    (nil? (nth v 1))          (assoc v 1 {})
    (not (map? (nth v 1)))    (into [(first v) {}] (subvec v 1))
    :else                     v))

(defn- ensure-clause-options*
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node) (not (map-entry? node)) (needs-options-map? node))
       (insert-options-map node)
       node))
   form))

;;; ============================================================
;;; Pass 1.7 -- unwrap nested `[field opts [field inner-opts target]]` clauses.
;;;
;;; LLMs occasionally write a `field` clause that wraps another `field` clause, e.g.
;;;
;;;   ["field" {"temporal-unit" "month"} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
;;;
;;; reasoning as "apply granularity to this field." The intended MBQL is a single
;;; `field` clause with the options merged -- outer options win on key conflicts (because
;;; the outer layer is what the LLM thought it was *adding*). We collapse nests of any
;;; depth into one flat `["field" <merged-opts> <target>]`.
;;;
;;; A `field` clause is recognised by head `"field"` at position 0, a map at position 1,
;;; and a third slot at position 2 that is either an FK path (vector of strings/nil) or a
;;; column-name string (cross-stage ref). When the third slot is itself a `field` clause,
;;; we collapse.
;;; ============================================================

(defn- field-clause-shape?
  "True if `v` looks like a `field` clause: `[\"field\" <opts-map> <target>]`."
  [v]
  (and (vector? v)
       (= 3 (count v))
       (= "field" (nth v 0))
       (map? (nth v 1))))

(defn- collapse-nested-field
  "If `node` is a `field` clause whose target slot is itself a `field` clause, collapse
  them into one clause with merged options (outer options win), recursively. Returns the
  collapsed clause (or the original `node` if no collapse applies)."
  [node]
  (loop [outer-opts (nth node 1)
         inner      (nth node 2)]
    (if (field-clause-shape? inner)
      (recur (merge (nth inner 1) outer-opts)
             (nth inner 2))
      ["field" outer-opts inner])))

(defn- unwrap-nested-field-clauses*
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (field-clause-shape? node)
              (field-clause-shape? (nth node 2)))
       (collapse-nested-field node)
       node))
   form))

;;; ============================================================
;;; Pass 1.75 -- strip stray double-quotes from portable-FK field references.
;;;
;;; The field metadata shown to the LLM historically rendered column names wrapped in
;;; double quotes (`<field name="\"col\"">`), and LLMs are SQL-trained to quote identifiers,
;;; so the model frequently emits a portable field reference whose column segment carries
;;; literal surrounding quotes:
;;;
;;;   ["field" {} ["DB" "SCH" "TBL" "\"col\""]]   (portable-FK column segment)
;;;
;;; The resolver rejects `"col"` as `:unknown-field`. A double-quote never legitimately wraps
;;; a portable identifier segment, so we strip a single balanced pair from each string segment
;;; of the **portable-FK vector** target. We only touch a `field` clause's target vector (never
;;; arbitrary strings), so filter literals such as `["=" {} <field> "\"paid\""]` are left
;;; untouched. Cross-stage *string* targets (`["field" {} "\"col\""]`) are deliberately left to
;;; the resolution-aware [[match-cross-stage-column]] pass, which only strips when the result
;;; matches a real previous-stage column.
;;; ============================================================

(defn- dequote-identifier
  "Strip one balanced pair of surrounding ASCII double-quotes from `s`. Idempotent; returns
  non-strings and unquoted strings unchanged."
  [s]
  (if (and (string? s)
           (>= (count s) 2)
           (str/starts-with? s "\"")
           (str/ends-with? s "\""))
    (subs s 1 (dec (count s)))
    s))

(defn- dequote-field-target
  "Dequote each string segment of a `field` clause's portable-FK vector target. Non-vector
  targets (cross-stage column-name strings) are returned unchanged."
  [target]
  (if (vector? target)
    (mapv #(if (string? %) (dequote-identifier %) %) target)
    target))

(defn- dequote-field-targets*
  [form]
  (walk/postwalk
   (fn [node]
     (if (field-clause-shape? node)
       (assoc node 2 (dequote-field-target (nth node 2)))
       node))
   form))

;;; ============================================================
;;; Pass 1.81 -- canonicalise common operator-name aliases.
;;;
;;; LLMs are heavily-trained on shell scripts, Python comparison protocols, and SQL-ish
;;; idioms. They occasionally pick up:
;;;
;;;   * shell-style comparison operators: `eq`, `ne`, `lt`, `lte` / `le`, `gt`, `gte` / `ge`
;;;     (cf. `man test`);
;;;   * verbose comparison spellings: `equals`, `not-equals`;
;;;   * lib-renamed aggregation / clause names that stuck around:
;;;       - `count-if`            → `count-where`
;;;       - `variance`            → `var`
;;;       - `stddev-pop`          → `stddev`
;;;       - `count-distinct`      → `distinct`
;;;       - `distinct-count`      → `distinct`
;;;       - `relative-date`       → `relative-datetime`
;;;       - `temporal-diff`       → `datetime-diff`
;;;       - `is-not-null`         → `not-null`
;;;
;;; The lib-rename set is carried over from the sexp pipeline's
;;; `metabase.agent-lib.syntax/canonical-operator-aliases` (see
;;; `repr-deletion-followups.md` § 1.1) - the original commentary recommended against
;;; reintroducing aliases, but we add the shell/SQL aliases anyway because LLMs are
;;; demonstrably shell-literate and the cost of supporting these names is one extra
;;; lookup at the start of the pipeline. The temporal-bucket aliases (`dayofweek`,
;;; `day-of-week`, `hour-of-day`, `month-of-year`, `quarter-of-year`) are kept in their
;;; own pass (1.8) for separate testing and because they target different lib heads
;;; depending on the unit.
;;;
;;; Notably **not** ported:
;;;   * `if` → `case`: lib accepts both (§conditional.cljc explicitly aliases them);
;;;   * `month` → `get-month`: ambiguous (could also be `:temporal-bucket :month`);
;;;   * `|` → `or`: too symbolic, unlikely from any model.
;;; ============================================================

(def ^:private operator-name-aliases
  "Lowercased alias → canonical lib head. Match is case-insensitive on lookup."
  {;; Shell-style / Python-style comparison
   "eq"             "="
   "equals"         "="
   "ne"             "!="
   "not-equals"     "!="
   "lt"             "<"
   "le"             "<="
   "lte"            "<="
   "gt"             ">"
   "ge"             ">="
   "gte"            ">="
   ;; Lib renames (carried over from sexp `canonical-operator-aliases`)
   "count-if"       "count-where"
   "variance"       "var"
   "stddev-pop"     "stddev"
   "count-distinct" "distinct"
   "distinct-count" "distinct"
   "relative-date"  "relative-datetime"
   "temporal-diff"  "datetime-diff"
   "is-not-null"    "not-null"})

(defn- operator-alias-clause?
  "True when `node` is a clause whose head (case-insensitive) matches a known alias and
  is not already canonical. Requires options-map at slot 1 - bare-clause case is handled
  by Pass 1, which runs first."
  [node]
  (and (vector? node)
       (>= (count node) 2)
       (string? (nth node 0))
       (map? (nth node 1))
       (let [lower (u/lower-case-en (nth node 0))]
         (and (contains? operator-name-aliases lower)
              (not= (nth node 0) (get operator-name-aliases lower))))))

(defn- rewrite-operator-name-aliases*
  [form]
  (walk/postwalk
   (fn [node]
     (if (operator-alias-clause? node)
       (assoc node 0 (get operator-name-aliases (u/lower-case-en (nth node 0))))
       node))
   form))

;;; ============================================================
;;; Pass 1.8 -- canonicalise temporal-bucket extraction aliases.
;;;
;;; LLMs naturally pick up English-flavoured operator names like `dayofweek`,
;;; `day-of-week`, `hour-of-day`, `month-of-year`, `quarter-of-year` for the temporal-
;;; extraction helpers. lib's canonical names are `get-day-of-week`, `get-hour`,
;;; `get-month`, `get-quarter` (see `metabase.lib.schema.expression.temporal`). We
;;; rewrite the alias forms to canonical so downstream resolve/validate doesn't reject
;;; them.
;;;
;;; Carried over from `metabase.agent-lib.repair.normalize.forms` (see
;;; `repr-deletion-followups.md` § 1.2). Idempotent: the rewrite only fires when the head
;;; is a known alias; canonical heads are left alone.
;;; ============================================================

(def ^:private temporal-bucket-extraction-aliases
  "Map from LLM-favoured alias to canonical lib operator name."
  {"dayofweek"       "get-day-of-week"
   "day-of-week"     "get-day-of-week"
   "hour-of-day"     "get-hour"
   "month-of-year"   "get-month"
   "quarter-of-year" "get-quarter"})

(defn- temporal-bucket-alias-clause?
  "True when `node` is a clause whose head is a known temporal-bucket-extraction alias.
  Requires an options map in slot 1 - the bare-clause case (no options) is handled by
  Pass 1, which runs first."
  [node]
  (and (vector? node)
       (>= (count node) 2)
       (string? (nth node 0))
       (map? (nth node 1))
       (contains? temporal-bucket-extraction-aliases (nth node 0))))

(defn- rewrite-temporal-bucket-aliases*
  [form]
  (walk/postwalk
   (fn [node]
     (if (temporal-bucket-alias-clause? node)
       (assoc node 0 (get temporal-bucket-extraction-aliases (nth node 0)))
       node))
   form))

;;; ============================================================
;;; Pass 1.85 -- canonicalise order-by direction aliases.
;;;
;;; The lib schema accepts only `[asc, {}, <ref>]` and `[desc, {}, <ref>]` as order-by
;;; direction clauses. LLMs sometimes write `[ascending, {}, …]` / `[descending, {}, …]`
;;; and uppercase variants like `[ASC, {}, …]`. We rewrite any case-insensitive variant of
;;; the four spellings (`asc`, `ascending`, `desc`, `descending`) to canonical lowercase
;;; `asc` / `desc` when used as a clause head.
;;;
;;; The rewrite is restricted to the **order-by-clause shape** (head + options map +
;;; exactly one ref-shaped argument); we don't touch a bare string "ASC"/"DESC" that might
;;; appear elsewhere as a literal value. Carried over with a wider alias set than the
;;; sexp original (which accepted only case-insensitive `asc`/`desc`); see
;;; `repr-deletion-followups.md` § 1.3.
;;; ============================================================

(def ^:private direction-aliases
  "Map from lowercase alias to canonical lib direction string."
  {"asc"        "asc"
   "ascending"  "asc"
   "desc"       "desc"
   "descending" "desc"})

(defn- direction-clause-head?
  "True when `head` is a non-canonical alias (case-insensitive variant of one of
  `direction-aliases`' keys) that should be rewritten. We exclude the canonical lowercase
  `asc` / `desc` so that already-canonical clauses pass through unchanged (preserving
  idempotency cheaply)."
  [head]
  (and (string? head)
       (let [lower (u/lower-case-en head)]
         (and (contains? direction-aliases lower)
              (not= head (get direction-aliases lower))))))

(defn- direction-alias-clause?
  "True when `node` is a clause-shaped vector (head + options-map + 1 arg) whose head is
  a direction alias to be rewritten."
  [node]
  (and (vector? node)
       (= 3 (count node))
       (map? (nth node 1))
       (direction-clause-head? (nth node 0))))

(defn- rewrite-direction-aliases*
  [form]
  (walk/postwalk
   (fn [node]
     (if (direction-alias-clause? node)
       (assoc node 0 (get direction-aliases (u/lower-case-en (nth node 0))))
       node))
   form))

;;; ============================================================
;;; Pass 1.87 -- rewrite known misspelled `lib/type` markers to their canonical value.
;;;
;;; Pass 2's `infer-*` helpers only FILL a missing marker; they never rewrite a present one.
;;; This pass handles the present-but-wrong case via a small alias table, exactly like the
;;; `rewrite-operator-name-aliases*` / `rewrite-temporal-bucket-aliases*` passes.
;;; ============================================================

(def ^:private lib-type-aliases
  "Known LLM misspellings of a `lib/type` marker -> its canonical value."
  {"mbql.join/join" "mbql/join"})

(defn- rewrite-lib-type-aliases*
  [form]
  (walk/postwalk
   (fn [node]
     (if-let [canonical (and (map? node) (lib-type-aliases (get node "lib/type")))]
       (assoc node "lib/type" canonical)
       node))
   form))

;;; ============================================================
;;; Pass 1.88 -- merge a trailing extra options-map into the position-1 options.
;;;
;;; LLMs sometimes place a clause's options at the END of the vector instead of
;;; (or in addition to) position 1. The canonical example:
;;;
;;;   ["time-interval" {} <expr> -1 "month" {"include-current" true}]
;;;
;;; The schema for `time-interval` is a strict `:tuple` of 5 elements with options
;;; at position 1 (the `include-current` flag lives there). The 6th element above
;;; is misplaced options - the LLM read the prompt's "Opts may set
;;; {include-current: true}" hint and put it after the args.
;;;
;;; We handle this generically across every fixed-arity tuple clause registered with
;;; `metabase.lib.schema.mbql-clause`. The expected-element-count table is derived
;;; once at namespace load from [[mbql-clause/registered-tags]] and selecting
;;; schemas whose head form is `:tuple`. Variadic clauses (`and`, `or`, `=`, `in`,
;;; `case`, `coalesce`, ...) use `:catn` / `:repeat` and are correctly excluded -
;;; their arity isn't fixed, so a trailing map could be a legitimate arg.
;;;
;;; Repair condition (all four required):
;;;   * clause-shaped vector (string head, not a map-entry, not an FK path);
;;;   * head matches a known fixed-arity clause;
;;;   * count is exactly `expected + 1` (count off by >=2 is too ambiguous - the
;;;     schema validator will reject it with a friendly tuple-shape error);
;;;   * position 1 is a map AND last element is a map.
;;;
;;; Repair action: merge the trailing map into position-1 options, with trailing
;;; keys winning on conflict (the trailing map is where the LLM wrote content;
;;; position 1 is typically `{}`). Then drop the trailing element.
;;;
;;; Idempotent by construction: a repaired clause has the canonical expected count,
;;; so the predicate fails on a second pass.
;;; ============================================================

(defn- tuple-clause-element-count
  "If `schema-form` is a `:tuple` schema (the shape [[mbql-clause/tuple-clause-schema]]
  produces), return the expected number of elements in matching tuples (head + opts + args).
  Returns `nil` for non-tuple schemas (`:catn` / `:repeat` variadic clauses) and for
  malformed inputs."
  [schema-form]
  (when (and (vector? schema-form)
             (= :tuple (first schema-form)))
    (let [after-head    (next schema-form)
          ;; Malli optionally puts a properties map at index 1; skip it if present.
          child-schemas (if (map? (first after-head))
                          (next after-head)
                          after-head)]
      (count child-schemas))))

(def ^:private fixed-arity-clause-element-counts
  "Map of clause-head-string -> expected element count, derived from the MBQL clause
  registry at first use. Includes only `:tuple` clauses; variadic `:catn` / `:repeat`
  clauses are excluded (their arity isn't fixed). Used by [[merge-trailing-options*]]
  to detect a misplaced trailing options map.

  Wrapped in `delay` so we don't pay the introspection cost at require time. If
  introspecting an individual clause's schema throws, the exception is allowed to
  propagate so a Malli reshape that breaks the walk surfaces immediately instead of
  silently dropping that clause from the table."
  (delay
    (into {}
          (keep (fn [tag]
                  (let [schema-name (mbql-clause/tag->registered-schema-name tag)
                        form        (mr/registered-schema schema-name)]
                    (when-let [n (tuple-clause-element-count form)]
                      [(name tag) n]))))
          (mbql-clause/registered-tags))))

(defn- needs-trailing-options-merge?
  "True when `node` is a fixed-arity tuple clause that the LLM wrote with one extra
  element at the end, and that extra element is a map. See the pass docstring above
  for the full condition."
  [node]
  (and (clause-like? node)
       (>= (count node) 3)
       (map? (nth node 1))
       (map? (peek node))
       (when-let [expected (get @fixed-arity-clause-element-counts (nth node 0))]
         (= (count node) (inc expected)))))

(defn- merge-trailing-options
  "Merge the trailing map into the position-1 options (trailing keys win) and drop
  the trailing element."
  [node]
  (let [head      (nth node 0)
        pos1-opts (nth node 1)
        trailing  (peek node)
        middle    (subvec node 2 (dec (count node)))
        merged    (merge pos1-opts trailing)]
    (into [head merged] middle)))

(defn- merge-trailing-options*
  [form]
  (walk/postwalk
   (fn [node]
     (if (needs-trailing-options-merge? node)
       (merge-trailing-options node)
       node))
   form))

;;; ============================================================
;;; Pass 1.89 -- merge a trailing options-map into position-1 on N-ary string-search filters
;;; (`contains` / `does-not-contain` / `starts-with` / `ends-with`).
;;;
;;; These four string filters are N-ary in MBQL (`[op opts field val1 val2 …]`, at least two
;;; string args) and carry their `case-sensitive` flag in the position-1 options map (see
;;; `metabase.lib.schema.filter/string-filter-options`). Because they're variadic, the
;;; fixed-arity [[merge-trailing-options*]] pass deliberately skips them -- there, a trailing
;;; map could be a legitimate arg. LLMs nonetheless append the case-sensitivity options as a
;;; trailing element, e.g.
;;;
;;;   ["contains" {} <field> "@gmail.com" {"case-sensitive" false}]
;;;
;;; A string-search value is always a string, never a map, so a trailing map is unambiguously
;;; misplaced options. We merge it into position-1 (trailing keys win) and drop it. Left
;;; unrepaired, `lib.normalize` cannot normalise the clause and the query explodes downstream
;;; with a missing-`lib/uuid` "Invalid output" error.
;;;
;;; Runs after [[ensure-clause-options*]] so position 1 is already a map. Idempotent: the
;;; repaired clause's last element is a string arg, so the predicate fails on a second pass.
;;; ============================================================

(def ^:private string-search-filter-heads
  "N-ary string-search filter heads whose options (e.g. `case-sensitive`) belong in the
  position-1 options map. See `metabase.lib.schema.filter`."
  #{"contains" "does-not-contain" "starts-with" "ends-with"})

(defn- needs-string-filter-options-merge?
  "True when `node` is an N-ary string-search filter whose last element is a misplaced trailing
  options map (the args before it are string values, never maps). See the pass docstring above."
  [node]
  (and (clause-like? node)
       (contains? string-search-filter-heads (nth node 0))
       ;; head + opts + field + >=1 value + trailing options-map
       (>= (count node) 5)
       (map? (nth node 1))
       (map? (peek node))))

(defn- merge-string-filter-trailing-options*
  [form]
  (walk/postwalk
   (fn [node]
     (if (needs-string-filter-options-merge? node)
       (merge-trailing-options node)
       node))
   form))

;;; ============================================================
;;; Pass 1.84 -- normalise alternative `case` / `if` argument shapes.
;;;
;;; lib's canonical shape is `[case, {}, [[pred1 then1] [pred2 then2] ...] default?]` -
;;; a single vector of branch pairs in slot 2, optional default in slot 3. LLMs sometimes
;;; emit alternative shapes that are unambiguously interpretable:
;;;
;;;   1. Three bare args: `[case, {}, pred, then, else]`
;;;      → `[case, {}, [[pred then]], else]`
;;;   2. Branch pairs as separate args: `[case, {}, [p1 t1], [p2 t2], default]`
;;;      → `[case, {}, [[p1 t1] [p2 t2]], default]`
;;;   3. Flat alternating: `[case, {}, p1, t1, p2, t2, default?]`
;;;      → `[case, {}, [[p1 t1] [p2 t2]], default?]`
;;;   4. Trailing `["else" x]` branch inside the pairs vector
;;;      → strip and treat `x` as the default.
;;;
;;; `if` is a documented alias for `case`; we normalise it the same way (lib accepts both
;;; tags and treats them identically). Carried over from the sexp pipeline's
;;; `repair/normalize/forms.clj/repair-case-args` (see `repr-deletion-followups.md`
;;; § 1.8).
;;;
;;; Idempotency: after the first rewrite the args are exactly `[<vector-of-pairs>]` or
;;; `[<vector-of-pairs>, <default>]`, neither of which matches the alternative-shape
;;; classifiers below.
;;; ============================================================

(defn- branch-pair? [v]
  (and (vector? v) (= 2 (count v))))

(defn- else-branch?
  "True for `[\"else\" x]` or its post-Pass-1 form `[\"else\" {} x]`. Pass 1
  (`ensure-clause-options*`) runs before us, so by the time this pass sees an LLM-authored
  `[\"else\" 0]` it has already been rewritten to `[\"else\" {} 0]`."
  [v]
  (and (vector? v)
       (string? (nth v 0))
       (= "else" (u/lower-case-en (nth v 0)))
       (or (= 2 (count v))
           (and (= 3 (count v)) (map? (nth v 1))))))

(defn- else-branch-payload [v]
  (if (= 2 (count v)) (nth v 1) (nth v 2)))

(defn- split-trailing-else
  "If the last entry of `branches` is an `else-branch?`, peel it off and use its payload
  as the default; otherwise return inputs unchanged."
  [branches default]
  (if (and (seq branches) (else-branch? (peek branches)))
    [(pop branches) (else-branch-payload (peek branches))]
    [branches default]))

(defn- canonical-case-args
  "Build the canonical `[<vector-of-pairs> default?]` arg sequence given already-classified
  `branches` (vector of pairs) and an optional `default`. Strips a trailing `else` branch
  from `branches`. Returns the canonical args vector for splicing into a `case` / `if`
  clause."
  [branches default]
  (let [[branches default] (split-trailing-else (vec branches) default)]
    (if (some? default)
      [(vec branches) default]
      [(vec branches)])))

(defn- pair-or-else? [v]
  (or (branch-pair? v) (else-branch? v)))

(defn- classify-case-args
  "Given the args of a `case` / `if` clause (everything after head + opts), return
  `[branches default]` for one of the recognised shapes - including the canonical one (so
  the central `canonical-case-args` step uniformly handles trailing-else stripping). Return
  `nil` only when the args are unrecognised."
  [args]
  (cond
    ;; Already canonical or canonical-with-trailing-else: a single vector in slot 0 whose
    ;; entries are branch-pairs (or a final else-branch), with optional explicit default in
    ;; slot 1.
    (and (or (= 1 (count args)) (= 2 (count args)))
         (vector? (nth args 0))
         (seq (nth args 0))
         (every? pair-or-else? (nth args 0)))
    [(nth args 0) (when (= 2 (count args)) (nth args 1))]

    ;; Three bare non-pair args: pred, then, else
    (and (= 3 (count args))
         (not (branch-pair? (nth args 0))))
    [[[(nth args 0) (nth args 1)]] (nth args 2)]

    ;; Two bare non-pair args: pred, then (no default)
    (and (= 2 (count args))
         (not (branch-pair? (nth args 0))))
    [[[(nth args 0) (nth args 1)]] nil]

    ;; Leading branch pairs followed by an optional non-pair fallback
    ;; (covers \"branch pairs as separate args\").
    (and (>= (count args) 2)
         (branch-pair? (nth args 0)))
    (let [pairs    (vec (take-while branch-pair? args))
          remainder (drop (count pairs) args)]
      [pairs (when (= 1 (count remainder)) (first remainder))])

    ;; Flat alternating pred/then args (≥4 args). Falls through from "branch pairs as
    ;; separate args" above when the first arg is a non-2-tuple vector like `["=" {} field
    ;; val]`.
    (>= (count args) 4)
    (let [n          (count args)
          even-cnt   (- n (rem n 2))
          pred-thens (partition 2 (take even-cnt args))
          default    (when (odd? n) (nth args (dec n)))]
      [(mapv vec pred-thens) default])

    :else nil))

(defn- case-clause? [v]
  (and (vector? v)
       (>= (count v) 2)
       (string? (nth v 0))
       (map? (nth v 1))
       (contains? #{"case" "if"} (nth v 0))))

(defn- normalise-case-args
  "Inspect the args of `clause`; if they match a recognised shape, return the clause with
  canonical args (uniformly stripping any trailing `else` branch from the pairs vector).
  Unrecognised args pass through untouched."
  [clause]
  (let [head (nth clause 0)
        opts (nth clause 1)
        args (subvec clause 2)]
    (if-let [[branches default] (classify-case-args args)]
      (let [canonical-args (canonical-case-args branches default)
            new-clause     (into [head opts] canonical-args)]
        ;; Idempotency: only return the rewritten form when it's actually different.
        ;; Identical → the input was already canonical.
        (if (= new-clause clause) clause new-clause))
      clause)))

(defn- normalise-case-clauses*
  [form]
  (walk/postwalk
   (fn [node]
     (if (case-clause? node)
       (normalise-case-args node)
       node))
   form))

;;; ============================================================
;;; Pass 1.82 -- normalise filter clauses where the LLM passed a values-list as a single
;;; vector arg.
;;;
;;; lib's canonical shape for `:in` / `:not-in` is **flat**: `[in, {}, lhs, v1, v2, v3]`.
;;; Likewise `:=` and `:!=` take exactly two operand args: `[=, {}, lhs, rhs]`. LLMs
;;; sometimes put the value list into a single vector slot:
;;;
;;;   [in,  {}, lhs, [v1, v2, v3]]      → splat → [in,  {}, lhs, v1, v2, v3]
;;;   [not-in, {}, lhs, [v1, v2, v3]]   → splat → [not-in, {}, lhs, v1, v2, v3]
;;;
;;; And occasionally use `=` / `!=` with a list value, expecting list-membership semantics:
;;;
;;;   [=,  {}, lhs, [v1, v2, v3]]       → [in,  {}, lhs, v1, v2, v3]
;;;   [!=, {}, lhs, [v1, v2, v3]]       → [not-in, {}, lhs, v1, v2, v3]
;;;
;;; Adapted from the sexp pipeline's `in`/`not-in`/`=`/`!=` repair branches (see
;;; `repr-deletion-followups.md` § 1.10). The sexp form `[in lhs [v1 v2 v3]]` was nested by
;;; design; the repr canonical form is flat, so we splat instead of just rewriting head.
;;;
;;; A "values list" is recognised conservatively: a non-empty vector whose every entry is a
;;; primitive scalar (string, number, boolean, nil). This excludes nested clauses
;;; (vectors with a string head + map options) and FK-path arguments (which only appear
;;; inside a `field` clause, never as values to a comparison op).
;;; ============================================================

(defn- scalar-literal? [v]
  (or (string? v) (number? v) (boolean? v) (nil? v)))

(defn- values-list? [v]
  (and (vector? v)
       (seq v)
       (every? scalar-literal? v)))

(defn- splat-in-values-clause [head opts lhs values]
  (into [head opts lhs] values))

(defn- =->in-head [head]
  (case head "=" "in" "!=" "not-in"))

(defn- comparison-lhs-clause?
  "Heuristic for what counts as a real \"left-hand side\" of a comparison: a clause vector
  with a string head and a map options at slot 1 (e.g. `field`, `expression`, `+`, etc.).
  Crucially, this excludes a bare FK-path vector (`[DB SCHEMA TABLE COL]`) - which is a
  vector of strings and would otherwise be mis-classified as an LHS by the value-list
  splat pass, making repair non-idempotent on adversarial property-test inputs that look
  like `[\"=\" {} [\"DB\" \"S\" \"T\"] [\"v1\" \"v2\"]]`."
  [v]
  (and (vector? v)
       (>= (count v) 2)
       (string? (nth v 0))
       (map? (nth v 1))))

(defn- list-value-comparison-clause
  "If `node` is a comparison clause whose last arg is a values-list, return
  `[head opts lhs values]` so the splat can be applied. Otherwise return `nil`.

  Recognises two shapes (pass runs *before* `ensure-clause-options*`):

    * `[head, opts-map, lhs, [v1 v2 …]]` (4 elements, options already in place); and
    * `[head, lhs, [v1 v2 …]]` (3 elements, options omitted - we splice an empty
      options map for downstream uniformity).

  Additionally requires `lhs` to be clause-shaped (`comparison-lhs-clause?`), to avoid
  mis-firing on adversarial inputs where every arg is a vector-of-strings."
  [heads node]
  (when (and (vector? node)
             (>= (count node) 3)
             (string? (nth node 0))
             (contains? heads (nth node 0)))
    (let [head    (nth node 0)
          opts-at (when (map? (nth node 1)) 1)
          ;; If options are present, lhs is at slot 2 and values at slot 3; otherwise
          ;; lhs is at slot 1 and values at slot 2. Either way we need exactly one lhs and
          ;; one values-list arg, so total args after head is either 2 (no opts) or 3 (opts).
          [lhs values-slot] (if opts-at
                              [(when (= 4 (count node)) (nth node 2))
                               (when (= 4 (count node)) (nth node 3))]
                              [(when (= 3 (count node)) (nth node 1))
                               (when (= 3 (count node)) (nth node 2))])]
      (when (and (comparison-lhs-clause? lhs)
                 (values-list? values-slot))
        [head (if opts-at (nth node 1) {}) lhs values-slot]))))

(defn- normalise-list-value-comparisons*
  "Pre-Pass-1 sweep: splat values-list args of `in`/`not-in` and rewrite `=`/`!=` against a
  values-list to `in`/`not-in`. Runs *before* `ensure-clause-options*` because Pass 1 would
  otherwise mis-identify a 2-element values-list (e.g. `[\"alice\" \"bob\"]`) as a bare
  clause and corrupt it by inserting `{}` between the two scalars."
  [form]
  (walk/postwalk
   (fn [node]
     (or (when-let [[head opts lhs values] (list-value-comparison-clause #{"in" "not-in"} node)]
           (splat-in-values-clause head opts lhs values))
         (when-let [[head opts lhs values] (list-value-comparison-clause #{"=" "!="} node)]
           (splat-in-values-clause (=->in-head head) opts lhs values))
         node))
   form))

;;; ============================================================
;;; Pass 1.83 -- unwrap boolean wrapper clauses.
;;;
;;; LLMs occasionally write `["true", x]` thinking of it as "wrap this clause as truthy",
;;; or `["false", x]` as "wrap this clause as falsy". Neither has any meaning in lib; the
;;; canonical equivalents are just `x` and `["not", {}, x]`. We unwrap when we see them.
;;; Carried over from the sexp pipeline's `syntax/boolean-wrapper-form?` (see
;;; `repr-deletion-followups.md` § 1.4).
;;;
;;; Form recognised: `["true"  {} x]` (1 arg) - unwrap to `x`.
;;;                  `["false" {} x]` (1 arg) - rewrite to `["not" {} x]`.
;;;
;;; The 0-arg literal forms `["true" {}]` and `["false" {}]` (boolean literals) are NOT
;;; touched. Multi-arg variants (≥2 args) we don't touch either - those would be
;;; legitimate uses of the head.
;;; ============================================================

(defn- boolean-wrapper-clause?
  "True when `node` is `[\"true\" {} x]` or `[\"false\" {} x]` - exactly one arg."
  [node]
  (and (vector? node)
       (= 3 (count node))
       (string? (nth node 0))
       (map? (nth node 1))
       (let [head (u/lower-case-en (nth node 0))]
         (or (= head "true")
             (= head "false")))))

(defn- unwrap-boolean-wrapper [node]
  (let [head (u/lower-case-en (nth node 0))
        x    (nth node 2)]
    (case head
      ;; Always emit a vector so we don't expose a bare scalar (`["true" {} x]` -> `x`) that a
      ;; sole-element parent would turn into an un-optioned clause `[x]`, which a later `repair`
      ;; pass would then "fix" to `[x {}]` - breaking idempotency. A wrapped clause is returned
      ;; as-is; a wrapped scalar becomes a clause with an empty options map.
      "true"  (if (vector? x) x [x {}])
      "false" ["not" {} x])))

(defn- unwrap-boolean-wrappers*
  [form]
  (walk/postwalk
   (fn [node]
     (if (boolean-wrapper-clause? node)
       (unwrap-boolean-wrapper node)
       node))
   form))

;;; ============================================================
;;; Pass 1.87 -- swap out-of-order literal bounds in `between` clauses.
;;;
;;; The lib schema for `:between` does not enforce `min <= max` (there's an explicit TODO
;;; comment in `metabase.lib.schema.filter` flagging this). LLMs occasionally swap the two
;;; bounds, especially for date ranges (e.g. `between(date, "2024-12-31", "2024-01-01")`).
;;; The query then runs but returns no rows, which is silently misleading. We swap the two
;;; bounds here when they're directly comparable literals.
;;;
;;; Cases handled:
;;;   * both bounds are numbers,
;;;   * both bounds are ISO-8601 date / date-time strings (string lex order = chronological
;;;     for ISO-8601),
;;;   * both bounds are `[absolute-datetime, {}, <iso-str>, <unit>]` clauses (the iso-str
;;;     drives the comparison).
;;;
;;; If either bound is non-literal (a `field` ref, an expression, a `relative-datetime`
;;; clause, etc.) we don't touch the clause - we can't compare without execution. See
;;; `repr-deletion-followups.md` § 1.5 (the scalar-wrap sub-case is intentionally not
;;; ported - the prompt is explicit about between's three-arg shape).
;;; ============================================================

(defn- absolute-datetime-clause? [v]
  (and (vector? v)
       (>= (count v) 3)
       (= "absolute-datetime" (nth v 0))
       (map? (nth v 1))
       (string? (nth v 2))))

(defn- between-bound-comparable
  "Extract a comparable value from `bound` if it's a literal we can order. Returns the
  value (a Number or String) or `nil` if the bound is not directly comparable."
  [bound]
  (cond
    (number? bound)                    bound
    (string? bound)                    bound
    (absolute-datetime-clause? bound)  (nth bound 2)
    :else                              nil))

(defn- bounds-comparable-and-swappable?
  "True when both bounds are extractable comparables of the same kind (both numbers, both
  strings) and the lower bound compares strictly greater than the upper."
  [lower upper]
  (let [lo (between-bound-comparable lower)
        hi (between-bound-comparable upper)]
    (cond
      (and (number? lo) (number? hi)) (> lo hi)
      (and (string? lo) (string? hi)) (pos? (compare lo hi))
      :else                            false)))

(defn- between-clause? [v]
  (and (vector? v)
       (= 5 (count v))
       (= "between" (nth v 0))
       (map? (nth v 1))))

(defn- swap-between-bounds*
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (between-clause? node)
              (bounds-comparable-and-swappable? (nth node 3) (nth node 4)))
       (-> node (assoc 3 (nth node 4)) (assoc 4 (nth node 3)))
       node))
   form))

;;; ============================================================
;;; Pass 1.86 -- wrap bare ISO-date string bounds in `between` clauses as
;;; `[absolute-datetime, {}, <iso-str>, "day"]`.
;;;
;;; LLMs frequently write `[between, {}, <date-field>, "2024-01-01", "2024-12-31"]`,
;;; using bare strings as the bounds. lib's `:between` schema demands a temporal
;;; expression on each side once any side is temporal; bare strings won't satisfy
;;; `:type/Date`. We detect the case where at least one of the two bounds matches the
;;; ISO-8601 `yyyy-mm-dd` pattern and wrap each matching string as an
;;; `["absolute-datetime" {} <iso-str> "day"]` clause. Carried over from the sexp
;;; pipeline's `wrap-iso-date-as-absolute-datetime` (see
;;; `repr-deletion-followups.md` § 1.6). High-frequency LLM pattern.
;;;
;;; Idempotency: after wrap, bounds are vectors, so the predicate (string + ISO regex)
;;; no longer matches.
;;; ============================================================

(def ^:private iso-date-pattern
  "Recognises an ISO-8601 calendar-date string (yyyy-mm-dd, optionally with a time portion)."
  #"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+\-]\d{2}:?\d{2})?)?")

(defn- iso-date-string? [v]
  (and (string? v)
       (re-matches iso-date-pattern (str/trim v))))

(defn- temporal-clause-head?
  "Heads that are unambiguously temporal-shaped clauses."
  [head]
  (contains? #{"absolute-datetime" "relative-datetime" "now"
               "get-year" "get-quarter" "get-month" "get-week" "get-day"
               "get-day-of-week" "get-hour" "get-minute" "get-second"}
             head))

(defn- temporal-shaped-clause? [v]
  (and (vector? v)
       (>= (count v) 1)
       (string? (nth v 0))
       (temporal-clause-head? (nth v 0))))

(defn- wrap-iso-date [v]
  (if (iso-date-string? v)
    ["absolute-datetime" {} (str/trim v) "day"]
    v))

(defn- between-needs-iso-wrap?
  "Trigger the ISO-wrap when at least one bound is already a temporal-shaped clause OR
  at least one bound is an ISO-date string. The first case mirrors sexp's behaviour
  (`temporal-expression?` on either side), the second case is a small extension - if
  both bounds are bare ISO date strings the structure is unambiguous and bare strings
  would fail validation anyway."
  [lo hi]
  (or (temporal-shaped-clause? lo)
      (temporal-shaped-clause? hi)
      (iso-date-string? lo)
      (iso-date-string? hi)))

(defn- wrap-iso-date-bounds*
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (between-clause? node)
              (between-needs-iso-wrap? (nth node 3) (nth node 4)))
       (-> node
           (assoc 3 (wrap-iso-date (nth node 3)))
           (assoc 4 (wrap-iso-date (nth node 4))))
       node))
   form))

;;; ============================================================
;;; Pass 1.865 -- wrap bare `"now"` string literals in temporal contexts as the canonical
;;; `["now" {}]` clause.
;;;
;;; LLMs sometimes write `[<, {}, <date-field>, "now"]` or `[between, {}, <field>,
;;; "2024-01-01", "now"]` - using the bare string `"now"` (case-insensitive, optional
;;; whitespace) where lib expects a `["now" {}]` clause. We rewrite such literals to the
;;; canonical clause shape **only inside a clause whose other operand is already temporal-
;;; shaped** (a `field` with `temporal-unit`, an `absolute-datetime`, a `relative-datetime`,
;;; another `now`, or one of the `get-*` extraction heads).
;;;
;;; The context restriction matters: a column literally containing the value `"now"` could
;;; legitimately appear as an operand in a non-temporal comparison. Carried over from the
;;; sexp pipeline's `wrap-now-as-expression` (see `repr-deletion-followups.md` § 1.7).
;;; ============================================================

(defn- now-literal? [v]
  (and (string? v)
       (= "now" (u/lower-case-en (str/trim v)))))

(defn- field-with-temporal-unit? [v]
  (and (vector? v)
       (>= (count v) 2)
       (= "field" (nth v 0))
       (map? (nth v 1))
       (contains? (nth v 1) "temporal-unit")))

(defn- temporal-context-operand? [v]
  (or (temporal-shaped-clause? v)
      (field-with-temporal-unit? v)))

(def ^:private temporal-comparison-heads
  "Comparison-style heads for which we'll wrap a bare `\"now\"` literal in another operand
  position."
  #{"=" "!=" "<" "<=" ">" ">=" "between"})

(defn- temporal-comparison-clause? [v]
  (and (vector? v)
       (>= (count v) 3)
       (string? (nth v 0))
       (map? (nth v 1))
       (contains? temporal-comparison-heads (nth v 0))))

(defn- wrap-now-literal [v]
  (if (now-literal? v)
    ["now" {}]
    v))

(defn- maybe-wrap-now-operands
  "For a comparison clause, return a clause with each `\"now\"` literal in arg positions
  rewritten to `[\"now\" {}]`, but only if at least one *other* operand in the clause is
  already temporal-shaped (so we know we're really in a temporal context)."
  [clause]
  (let [args (subvec clause 2)]
    (if (some temporal-context-operand? args)
      (let [rewritten (mapv wrap-now-literal args)]
        (into (subvec clause 0 2) rewritten))
      clause)))

(defn- wrap-now-literals*
  [form]
  (walk/postwalk
   (fn [node]
     (if (temporal-comparison-clause? node)
       (maybe-wrap-now-operands node)
       node))
   form))

;;; ============================================================
;;; Pass 1.55 -- normalise `fields:` on a stage / join when the LLM wrote a single clause
;;; instead of a sequential of clauses.
;;;
;;; The repr schema for both stage and join requires
;;; `"fields": [:sequential [:ref ::clause]]` (joins additionally accept the enum strings
;;; `"all"` / `"none"`). LLMs occasionally write a single clause as the value, e.g.
;;;
;;;   stages:
;;;   - …
;;;     fields: [field, {}, [Sample, PUBLIC, T, COL]]
;;;
;;; rather than the canonical list-of-one
;;;
;;;   stages:
;;;   - …
;;;     fields:
;;;     - [field, {}, [Sample, PUBLIC, T, COL]]
;;;
;;; The single-clause shape would otherwise fail validation. We detect it (a vector whose
;;; slot 0 is a string head AND slot 1 is a map - i.e. clause-shaped) and wrap it in a
;;; one-element list.
;;;
;;; Carried over from the sexp pipeline's \`normalize-with-fields-selection\` (see
;;; `repr-deletion-followups.md` § 1.9). Idempotent: after wrapping, the value is
;;; sequential-of-clause and the predicate no longer matches.
;;; ============================================================

(defn- single-clause-shape? [v]
  (and (vector? v)
       (>= (count v) 2)
       (string? (nth v 0))
       (map? (nth v 1))))

(defn- normalise-fields-key [m]
  (let [fields (get m "fields")]
    (if (single-clause-shape? fields)
      (assoc m "fields" [fields])
      m)))

(defn- normalise-fields-shape*
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (map? node) (contains? node "fields"))
       (normalise-fields-key node)
       node))
   form))

;;; ============================================================
;;; Pass 1.5 -- normalize `expressions:` shape (map -> sequential; stamp `lib/expression-name`)
;;;
;;; MBQL 5 requires `:expressions` to be a `[:sequential ...]` where each entry is an
;;; expression clause carrying `:lib/expression-name` in its options map. LLMs naturally
;;; want to write a map-shape `expressions: {Name: [op, {}, ...]}` (with the expression
;;; name as the map key), which is far more readable. We accept both shapes here and
;;; normalise to the canonical sequential form, stamping `lib/expression-name` into each
;;; clause's options from the map key.
;;;
;;; If the author already wrote the sequential form, we leave the expression-name alone
;;; (authoritative in options). If both a map key AND `lib/expression-name` exist and
;;; disagree, the options-map wins (we don't overwrite authored metadata).
;;; ============================================================

(defn- expression-clause?
  "An expression definition clause: a vector whose position-1 element is a map (options).
  Anything else - a literal value, a non-vector, an empty vector - we leave alone and let
  schema validation complain."
  [x]
  (and (vector? x)
       (>= (count x) 2)
       (map? (nth x 1))))

(defn- stamp-expression-name
  "If the clause doesn't already have `\"lib/expression-name\"` in its options, stamp the
  given name. Otherwise leave the clause alone."
  [clause expr-name]
  (let [opts (nth clause 1)]
    (if (contains? opts "lib/expression-name")
      clause
      (assoc clause 1 (assoc opts "lib/expression-name" expr-name)))))

(defn- normalize-stage-expressions
  [stage]
  (let [exprs (get stage "expressions")]
    (cond
      ;; Map-shape: {Name clause, ...} -> [clause-with-name ...]
      (map? exprs)
      (assoc stage "expressions"
             (into []
                   (keep (fn [[expr-name clause]]
                           (when (expression-clause? clause)
                             (stamp-expression-name clause expr-name))))
                   exprs))

      ;; Sequential: leave as-is (name lives in each clause's options; schema enforces).
      (sequential? exprs)
      stage

      ;; Missing or something we don't understand: leave alone.
      :else
      stage)))

(defn- normalize-expressions-shape*
  "Walk the query and, for every map that has an `\"expressions\"` key, convert a map-shape
  expressions block into the canonical sequential shape with `lib/expression-name` stamped
  from the map key. Idempotent: sequential input passes through unchanged."
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (map? node) (contains? node "expressions"))
       (normalize-stage-expressions node)
       node))
   form))

;;; ============================================================
;;; Pass 1.9 -- stamp top-level `database:` from the first stage
;;;
;;; Rationale: the `representations` spec mandates a top-level `database:` field on every
;;; query (see `../representations/core-spec/v1/schemas/common/query.yaml`), but every
;;; database-identifying piece of information is already available in the first stage's
;;; `source-table:` (a portable FK `[db, schema, table]`) or `source-card:` (an entity_id
;;; whose card carries a `database_id`). We remove `database:` from the LLM-facing tool
;;; contract - one less thing for the model to get wrong, one less failure mode where the
;;; top-level name disagrees with the FKs.
;;;
;;; To keep the downstream spec-compliant (lib.schema/Query, validate-query, etc.), this pass
;;; stamps the top-level `database:` from the first stage. Sources of truth, in order:
;;;
;;;   1. `stages[0].source-table[0]` - the db-name component of the portable table FK.
;;;   2. `stages[0].source-card` - entity_id; look up the card, read its `database_id`, then
;;;      the database's name via the metadata provider.
;;;
;;; **Silent overwrite on conflict.** If the LLM did author a `database:` field and it
;;; disagrees with what we computed, we overwrite it. The first-stage source is more detailed
;;; and is what the resolver actually uses; there's no reason to trust a dangling top-level
;;; name over it.
;;;
;;; **No-op when we can't derive anything** (no source-table, and source-card lookup failed /
;;; absent). The enclosing pipeline's `resolve-database-id-from-first-stage` already raised
;;; before we got here in that case, but we guard here too for test isolation.
;;; ============================================================

(defn- db-name-from-source-table
  "Pull the first element (db-name) out of `stages[0].source-table`, or nil."
  [query]
  (let [fk (get-in query ["stages" 0 "source-table"])]
    (when (and (vector? fk) (>= (count fk) 1) (string? (nth fk 0)))
      (nth fk 0))))

(defn- db-name-from-mp
  "Read the canonical database name off the metadata provider, or nil on failure."
  [mp]
  (when mp
    (try
      (:name (lib.metadata.protocols/database mp))
      (catch Exception _ nil))))

(defn- infer-top-level-database*
  "Stamp (or overwrite) the top-level `database:` field on a parsed query.

  Only applies to maps that look like a top-level query - those that have a `stages` key.
  We intentionally do NOT stamp `database:` on arbitrary maps: the `repair` entry point is
  sometimes exercised with a non-query input (shape-pass unit tests, plain data), and we
  must preserve those inputs unchanged modulo the structural repairs.

  Source of truth, in order:
    1. The metadata provider's database name - authoritative, since the MP was built from the
       database-id resolved from the first stage. This is always correct when present.
    2. The raw `stages[0].source-table[0]` string - fallback for the `mp == nil` case (unit
       tests of this pass in isolation).

  **Silent overwrite on conflict.** If the LLM authored a `database:` field that disagrees
  with the computed value, we overwrite it: the source is more detailed and is what the
  resolver actually uses; a dangling top-level name has no independent authority."
  [query mp]
  (if-not (and (map? query) (contains? query "stages"))
    query
    (if-let [db-name (or (db-name-from-mp mp)
                         (db-name-from-source-table query))]
      (assoc query "database" db-name)
      query)))

;;; ============================================================
;;; Pass 2 -- fill in missing `lib/type` markers
;;; ============================================================

(defn- top-level-query-map?
  [m]
  (and (map? m)
       (contains? m "database")
       (contains? m "stages")))

(defn- join-like-map?
  "A map that looks like an explicit join: it carries join-only keys (`conditions`, or
  `alias`+`stages`) that never appear on a stage or top-level query. We key on these rather
  than on `\"fields\"` (which a join shares with a stage) so a join is not mistaken for a
  stage by [[stage-like-map?]]."
  [m]
  (and (map? m)
       (or (contains? m "conditions")
           (and (contains? m "alias")
                (contains? m "stages")))))

(defn- stage-like-map?
  "A map that looks like an MBQL stage: has `\"source-table\"`, `\"source-card\"`, or any of the
  stage-body keys (`filters`, `aggregation`, `breakout`, `order-by`, `fields`, `joins`,
  `expressions`, `limit`). Not a top-level query and not an explicit join (a join can carry
  `\"fields\"`, so we exclude it explicitly)."
  [m]
  (and (map? m)
       (not (top-level-query-map? m))
       (not (join-like-map? m))
       (boolean
        (some #(contains? m %)
              ["source-table" "source-card" "filters" "aggregation"
               "breakout" "order-by" "fields" "joins" "expressions" "limit"]))))

(defn- infer-query-lib-type [m]
  (if (and (top-level-query-map? m) (not (contains? m "lib/type")))
    (assoc m "lib/type" "mbql/query")
    m))

(defn- infer-join-lib-type [m]
  (if (and (join-like-map? m) (not (contains? m "lib/type")))
    (assoc m "lib/type" "mbql/join")
    m))

(defn- infer-stage-lib-type [m]
  (if (and (stage-like-map? m) (not (contains? m "lib/type")))
    (assoc m "lib/type" "mbql.stage/mbql")
    m))

(defn- ensure-lib-types* [form]
  (walk/postwalk
   (fn [node]
     (if (map? node)
       (-> node infer-query-lib-type infer-join-lib-type infer-stage-lib-type)
       node))
   form))

;;; ============================================================
;;; Pass 2.7 -- rewrite inline aggregation expressions in `order-by` to aggregation refs
;;;
;;; Background: when the user asks for something like "top categories by total revenue", the
;;; LLM tends to write `order-by` by re-stating the aggregation expression inline:
;;;
;;;   aggregation: [[sum, {}, [field, {}, [..., TOTAL]]]]
;;;   order-by:    [[desc, {}, [sum, {}, [field, {}, [..., TOTAL]]]]]   # <-- inline copy
;;;
;;; In MBQL 5 / legacy MBQL the `order-by` direction must wrap an aggregation **reference**,
;;; not the aggregation expression itself. The `lib.normalize` step accepts the inline form
;;; structurally, but `lib/->legacy-MBQL` produces a query that fails legacy-schema validation
;;; the moment something downstream re-loads it (e.g. when the chart is opened, the QP
;;; round-trips through legacy MBQL and explodes with `Invalid output: {:query {:order-by ...}}`).
;;;
;;; This pass detects the pattern, structurally matches each `order-by` inner clause against
;;; the stage's `aggregation` list (ignoring options-map differences), and:
;;;   * stamps a UUID into the matching aggregation's options (if it doesn't already have one);
;;;   * replaces the inline `order-by` aggregation with `["aggregation" {} "<that-uuid>"]`.
;;;
;;; This does NOT introduce general placeholder-UUID handling (Phase 2 step 10 - `@agg-N`
;;; references); we only resolve the very specific "order-by re-states the aggregation inline"
;;; mistake. If the LLM writes a `["aggregation" {} "..."]` ref directly, we leave it alone.
;;; ============================================================

(defn- strip-clause-options
  "Recursively remove the options map (slot at position 1) from every clause-like vector in
  `form`. Used as a structural-equality key so we can match an inline `order-by` aggregation
  against the stage's `aggregation` entry without being thrown off by `lib/uuid` differences
  or unrelated option keys.

  Walks via `postwalk` and uses the same `clause-like?` predicate as the options-insertion
  pass, so map-entries, FK-paths, and non-clause vectors are left alone."
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node)
              (not (map-entry? node))
              (clause-like? node)
              (>= (count node) 2)
              (map? (nth node 1)))
       (into [(first node)] (subvec node 2))
       node))
   form))

(defn- ensure-aggregation-uuid
  "Return a tuple `[stamped-aggregation uuid]`. If the aggregation already has a `lib/uuid` in
  its options, reuse it; otherwise generate one and assoc it in. Always returns the UUID for
  use in the corresponding aggregation reference."
  [aggregation]
  (let [opts (when (and (vector? aggregation) (>= (count aggregation) 2) (map? (nth aggregation 1)))
               (nth aggregation 1))
        existing (get opts "lib/uuid")
        uuid     (or existing (str (random-uuid)))]
    (if existing
      [aggregation uuid]
      [(assoc aggregation 1 (assoc (or opts {}) "lib/uuid" uuid)) uuid])))

(defn- aggregation-ref-clause?
  "True if `clause` is already an `[\"aggregation\" {opts} \"<uuid>\"]` reference. We never
  rewrite these."
  [clause]
  (and (vector? clause)
       (>= (count clause) 3)
       (= "aggregation" (first clause))))

(defn- order-by-direction-clause?
  "True if `clause` is `[\"asc\" {} <inner>]` or `[\"desc\" {} <inner>]`."
  [clause]
  (and (vector? clause)
       (>= (count clause) 3)
       (contains? #{"asc" "desc"} (first clause))))

(defn- rewrite-order-by-inline-aggs-in-stage
  "Apply the inline-agg-in-`order-by` rewrite to a single string-keyed stage map. Returns the
  updated stage. No-op when the stage has no `order-by` or no `aggregation`."
  [stage]
  (let [aggs    (get stage "aggregation")
        ord     (get stage "order-by")]
    (if-not (and (vector? aggs) (seq aggs) (vector? ord) (seq ord))
      stage
      ;; Build a structural-key → index lookup over the aggregations once.
      (let [agg-key->idx (into {}
                               (map-indexed (fn [i a] [(strip-clause-options a) i]))
                               aggs)
            ;; Mutable-style accumulators: walk order-by, simultaneously collecting any
            ;; aggregations that need a UUID stamped in.
            *aggs* (atom aggs)
            new-ord
            (mapv
             (fn [direction-clause]
               (if-not (order-by-direction-clause? direction-clause)
                 direction-clause
                 (let [inner (nth direction-clause 2)]
                   (cond
                     ;; Already an aggregation ref - leave it alone.
                     (aggregation-ref-clause? inner)
                     direction-clause

                     ;; Inline aggregation that matches one of the stage's aggregations.
                     (and (vector? inner)
                          (contains? agg-key->idx (strip-clause-options inner)))
                     (let [idx (get agg-key->idx (strip-clause-options inner))
                           [stamped uuid] (ensure-aggregation-uuid (nth @*aggs* idx))]
                       (swap! *aggs* assoc idx stamped)
                       (assoc direction-clause 2 ["aggregation" {} uuid]))

                     :else
                     direction-clause))))
             ord)]
        (assoc stage "aggregation" @*aggs* "order-by" new-ord)))))

(defn- rewrite-order-by-inline-aggs*
  "Top-level pass for inline-aggregation-in-order-by repair. Walks every stage in the query
  (not just `stages[0]`) since the same mistake can appear in multi-stage queries."
  [query]
  (if-not (and (map? query) (vector? (get query "stages")))
    query
    (update query "stages" #(mapv rewrite-order-by-inline-aggs-in-stage %))))

;;; ============================================================
;;; Pass 2.8 -- resolve integer-index aggregation references to UUID form
;;;
;;; LLM-authored queries commonly use a 0-based integer index to refer to an aggregation
;;; from the same stage: `[aggregation, {}, 0]` means "the first aggregation in this stage".
;;; This mirrors legacy MBQL 4 prior art (`[:aggregation 0]`, see `legacy_mbql/schema.cljc`)
;;; and is far easier for the model to produce than a UUID-based ref.
;;;
;;; MBQL 5's canonical form is `[aggregation, {lib/uuid, base-type, effective-type, …},
;;; "<uuid-string>"]` where the string in slot 2 is the `:lib/uuid` of the target
;;; aggregation clause in the same stage. This pass walks each stage, builds an
;;; index→uuid map over the stage's `aggregation:` vector (stamping a UUID on each agg
;;; clause that lacks one), then rewrites every `[aggregation, opts, <int>]` clause to the
;;; canonical form with `base-type`/`effective-type` inferred from the aggregation head.
;;;
;;; Same-stage refs only. Cross-stage aggregation references (a stage-N+1 `:aggregation`
;;; ref pointing at a stage-N aggregation) are **out of scope** for this pass - pMBQL
;;; actually forbids that shape; the correct downstream form is a cross-stage field ref by
;;; the aggregation's column name, which Pass 4 handles once the column name is known.
;;; An out-of-range or no-aggregations stage raises an `:agent-error?` ex-info with a
;;; helpful message listing the available indices/heads.
;;; ============================================================

(defn- integer-index-agg-ref?
  "True if `clause` is `[\"aggregation\", <opts>, <non-negative-int>]`."
  [clause]
  (and (vector? clause)
       (= 3 (count clause))
       (= "aggregation" (nth clause 0))
       (map? (nth clause 1))
       (let [idx (nth clause 2)]
         (and (integer? idx) (not (neg? idx))))))

(defn- inner-clause-field-base-type
  "Best-effort inner-field type extraction for `sum`/`min`/`max` etc. Looks for a nested
  `[\"field\" {\"base-type\" T, …} …]` clause; returns nil if none found."
  [agg-clause]
  (when (and (vector? agg-clause) (>= (count agg-clause) 3))
    (let [inner (nth agg-clause 2)]
      (when (and (vector? inner)
                 (>= (count inner) 2)
                 (= "field" (nth inner 0))
                 (map? (nth inner 1)))
        (get (nth inner 1) "base-type")))))

(defn- infer-agg-base-type
  "Return the string base-type for an aggregation clause. Small, intentionally inexact
  lookup table keyed by clause head - this is a shape pass, not a resolver. Return values
  are the string forms expected in the portable repair output.

  Heads whose output type tracks an inner field (`sum`, `min`, `max`, etc) try to pull the
  inner field's authored `base-type`; fall through to `type/*` if unknown."
  [agg-clause]
  (let [head (when (and (vector? agg-clause) (>= (count agg-clause) 1))
               (nth agg-clause 0))]
    (case head
      ("count" "distinct" "cum-count" "count-where") "type/BigInteger"
      ("avg" "median" "stddev" "var" "share")        "type/Float"
      ("sum" "sum-where" "cum-sum" "min" "max")
      (or (inner-clause-field-base-type agg-clause) "type/Float")
      "type/*")))

(defn- ensure-aggregation-uuids
  "Walk the stage's aggregation vector, stamping `lib/uuid` into each clause's options map
  when missing. Returns `[stamped-aggs index->uuid]` where `index->uuid` is a vector aligned
  with the aggregation vector."
  [aggs]
  (reduce
   (fn [[acc-aggs acc-uuids] agg]
     (let [[stamped uuid] (ensure-aggregation-uuid agg)]
       [(conj acc-aggs stamped) (conj acc-uuids uuid)]))
   [[] []]
   aggs))

(defn- agg-heads-summary
  "Return a short human-readable summary like `[sum at 0, count at 1]` for error messages."
  [aggs]
  (str "["
       (str/join ", "
                 (map-indexed (fn [i a]
                                (let [head (when (and (vector? a) (>= (count a) 1))
                                             (nth a 0))]
                                  (str head " at " i)))
                              aggs))
       "]"))

(defn- rewrite-integer-agg-refs-in-tree
  "Postwalk `tree` replacing every integer-index aggregation ref with its canonical
  UUID-keyed form. Uses `index->uuid` / `index->type` (both vectors aligned with the
  stage's aggregation vector) for the rewrite. Throws agent-error ex-info on out-of-range.

  Does NOT descend into the stage's own `aggregation:` vector; that's handled by the
  caller (we don't want to rewrite a stray integer that legitimately means \"the number 0\"
  inside an aggregation's args)."
  [tree index->uuid index->type aggs-for-error]
  (walk/postwalk
   (fn [node]
     (if (integer-index-agg-ref? node)
       (let [[_ opts idx] node]
         (if-let [uuid (get index->uuid idx)]
           (let [inferred-type (get index->type idx)
                 new-opts      (cond-> opts
                                 (and inferred-type (not (contains? opts "base-type")))
                                 (assoc "base-type" inferred-type)
                                 (and inferred-type (not (contains? opts "effective-type")))
                                 (assoc "effective-type" inferred-type))]
             ["aggregation" new-opts uuid])
           (throw (ex-info (tru "Aggregation index {0} out of range; stage has {1} aggregation(s): {2}"
                                idx (count index->uuid) (agg-heads-summary aggs-for-error))
                           {:agent-error? true
                            :error        :aggregation-ref-out-of-range
                            :index        idx
                            :available    (count index->uuid)
                            :heads        (mapv (fn [a] (when (vector? a) (first a))) aggs-for-error)}))))
       node))
   tree))

(defn- stage-has-integer-agg-ref?
  "Does `stage` contain any `[aggregation, {}, <int>]` clause anywhere? Used to decide
  whether to complain about a missing `aggregation:` vector (if there are no integer refs
  and no `aggregation:` block, it's a perfectly valid stage)."
  [stage]
  (let [found? (atom false)]
    (walk/postwalk
     (fn [n]
       (when (integer-index-agg-ref? n) (reset! found? true))
       n)
     (dissoc stage "aggregation"))
    @found?))

(defn- resolve-integer-agg-refs-in-stage
  "Resolve all integer-index aggregation refs in a single stage to canonical UUID form.
  No-op when the stage has neither `aggregation:` nor any integer-indexed refs."
  [stage]
  (let [aggs (get stage "aggregation")]
    (cond
      ;; No integer refs anywhere in the stage - nothing to do.
      (not (stage-has-integer-agg-ref? stage))
      stage

      ;; Integer ref(s) present but stage has no aggregation vector - agent-error.
      (not (and (vector? aggs) (seq aggs)))
      (throw (ex-info (tru "Found an integer-indexed aggregation reference but this stage has no `aggregation:` clause")
                      {:agent-error? true
                       :error        :aggregation-ref-no-aggregations}))

      :else
      (let [[stamped-aggs index->uuid] (ensure-aggregation-uuids aggs)
            index->type                (mapv infer-agg-base-type stamped-aggs)
            ;; Walk everything EXCEPT the `aggregation:` vector itself. We replace that
            ;; vector with a sentinel during the walk and restore it after. (Simpler than
            ;; implementing a custom non-descending walker.)
            stage-wo-aggs              (assoc stage "aggregation" ::placeholder)
            rewritten                  (rewrite-integer-agg-refs-in-tree
                                        stage-wo-aggs index->uuid index->type stamped-aggs)]
        (assoc rewritten "aggregation" stamped-aggs)))))

(defn- resolve-aggregation-ref-indexes*
  "Top-level pass: resolve 0-based integer `[aggregation, {}, <idx>]` references to the
  canonical MBQL 5 `[aggregation, {lib/uuid, base-type, effective-type}, \"<uuid>\"]`
  shape. See block comment above."
  [query]
  (if-not (and (map? query) (vector? (get query "stages")))
    query
    (let [stages (get query "stages")]
      (log/debugf "[repr-repair] resolve-aggregation-ref-indexes*: %d stage(s)" (count stages))
      (assoc query "stages" (mapv resolve-integer-agg-refs-in-stage stages)))))

;;; ============================================================
;;; Pass 2.9 -- auto-split a stage that uses a same-stage aggregation reference inside a
;;; `filters:` clause (post-aggregation / HAVING-style filter) into two stages.
;;;
;;; lib's canonical shape forbids `[aggregation, {}, <uuid>]` to appear inside a stage's
;;; `filters:` (or `breakout:`, `expressions:`) - that's a HAVING-clause situation in SQL
;;; terms, and in pMBQL it must be expressed as a *second stage* whose `filters:` reference
;;; the aggregation's output column by name. lib's schema is shape-only and does not catch
;;; this; the broken query goes through validate, resolve, and only fails at SQL-generation
;;; time (or, worse, silently produces wrong results). LLMs habitually write the single-
;;; stage shape because that's the SQL idiom (`HAVING count(*) > 10`).
;;;
;;; Carried over from the sexp pipeline's stage-boundary inference (see
;;; `repr-deletion-followups.md` § 1.11).
;;;
;;; Detection
;;; =========
;;; For each stage S whose `aggregation:` is non-empty, build the set of `lib/uuid`s of S's
;;; aggregations. Walk every entry of `S.filters` looking for any
;;; `[aggregation, opts, <uuid>]` clause whose uuid is in that set. If found, the stage is
;;; "post-agg-filter-broken".
;;;
;;; Auto-fix
;;; ========
;;; Derive the output column-name for each aggregation (static lib-mirroring table, plus
;;; `"name"` opts override). If any aggregation's name can't be derived (custom heads,
;;; `metric` ref needing the metadata-provider, etc.), throw `:agent-error?` with a clear
;;; message - the LLM retry will then either avoid the pattern or refactor to multi-stage
;;; explicitly.
;;;
;;; When all names are derivable, split S into [S0, S1]:
;;;
;;;   * S0 keeps: source-*, joins, aggregation, breakout, expressions, and any pre-agg
;;;     filters (those that do NOT reference a same-stage agg-ref).
;;;   * S1 (new, no source-table) takes:
;;;       - the offending filters, with `[aggregation, {}, <uuid>]` rewritten to
;;;         `[field, {}, "<column-name>"]` (cross-stage ref);
;;;       - the original `order-by:` (if any), with the same rewrite applied;
;;;       - the original `limit:`;
;;;       - the original `fields:` (if any).
;;;
;;; Why move order-by + limit + fields? The user's intent is "of {rows matching the filter},
;;; the top-N sorted by X, projecting columns Y". Leaving order-by/limit/fields in S0 would
;;; sort/limit/project *before* the filter, producing a different (smaller) row set and the
;;; wrong semantics. They semantically belong on the post-filter view.
;;;
;;; Pre-agg filters (those NOT referencing agg-ref) STAY in S0 so they can do row
;;; filtering before aggregation as the LLM intended.
;;;
;;; Idempotency
;;; ===========
;;; After the split, S0 has no `[aggregation, {}, <uuid>]` ref in its filters and S1 has no
;;; aggregation: vector at all. Re-running the pass finds no triggering shape and is a
;;; no-op.
;;;
;;; This pass runs AFTER `resolve-aggregation-ref-indexes*` (so integer-index refs are
;;; already in UUID form) and BEFORE `infer-cross-stage-field-types*` (so the new
;;; cross-stage `field` refs we synthesise get their `base-type` / `effective-type` filled
;;; in by Pass 5).
;;; ============================================================

(def ^:private aggregation-column-name-table
  "Lib-mirroring static table: aggregation head → the output column name lib's
  `column-name-method` produces. Covers all the heads we expect from LLM-authored queries
  in the absence of an explicit `name` override. `metric` is intentionally NOT in this
  table - resolving its column name needs the metadata-provider, and the auto-split caller
  emits a clean diagnostic when it can't derive a name."
  {"count"          "count"
   "cum-count"      "count"
   "distinct"       "count"
   "count-where"    "count_where"
   "distinct-where" "count_where"
   "avg"            "avg"
   "max"            "max"
   "median"         "median"
   "min"            "min"
   "stddev"         "stddev"
   "sum"            "sum"
   "var"            "var"
   "cum-sum"        "sum"
   "percentile"     "percentile"})

(defn- aggregation-clause-column-name
  "Derive the output column-name an aggregation will produce, mirroring lib's
  `column-name-method`. An explicit `\"name\"` in opts (lib's column-name override) takes
  precedence. Returns `nil` when we can't determine the name (e.g. `metric` head, custom
  head not in the table); the caller treats that as \"please diagnose, don't auto-fix\"."
  [agg]
  (when (and (vector? agg) (>= (count agg) 2))
    (or (let [n (get (nth agg 1) "name")]
          (when (and (string? n) (not= n "")) n))
        (get aggregation-column-name-table (nth agg 0)))))

(defn- collect-stage-agg-uuids
  "Set of `lib/uuid` strings on the aggregation clauses of `stage`. Aggregations without a
  uuid (shouldn't happen post-Pass-2.7/2.8 but guard anyway) contribute nothing."
  [stage]
  (into #{}
        (keep (fn [agg]
                (when (and (vector? agg) (>= (count agg) 2) (map? (nth agg 1)))
                  (let [u (get (nth agg 1) "lib/uuid")]
                    (when (string? u) u)))))
        (get stage "aggregation")))

(defn- form-references-stage-agg?
  "True if `form` contains any `[aggregation, opts, <uuid>]` clause whose uuid is in
  `same-stage-uuids`."
  [form same-stage-uuids]
  (let [found? (atom false)]
    (walk/postwalk
     (fn [n]
       (when (and (vector? n)
                  (>= (count n) 3)
                  (= "aggregation" (nth n 0))
                  (string? (nth n 2))
                  (contains? same-stage-uuids (nth n 2)))
         (reset! found? true))
       n)
     form)
    @found?))

(defn- aggregation-uuid->column-name
  "Build a `{uuid → column-name}` map for the stage's aggregation vector. Returns `nil` when
  auto-split isn't safe — the caller emits the `:post-agg-filter-needs-multi-stage`
  diagnostic and the LLM must author two stages explicitly.

  Two unsafe conditions:

  * Any aggregation fails to produce a column name (e.g. a `metric` head whose name needs
    the metadata provider, or a custom head not in the static table).

  * Two aggregations produce the **same** output column name. lib would dedupe these via
    `unique-name-generator` (`sum` / `sum_2` / …) which depends on field order; our static
    table can't replicate that without recreating the generator. Picking either name in
    the cross-stage `[\"field\" {} <name>]` rewrite would silently filter against the
    wrong column."
  [aggs]
  (let [m (reduce
           (fn [acc agg]
             (let [uuid (get-in agg [1 "lib/uuid"])]
               (if (and (string? uuid) (not= uuid ""))
                 (if-let [col-name (aggregation-clause-column-name agg)]
                   (assoc acc uuid col-name)
                   (reduced nil))
                 acc)))
           {}
           aggs)]
    (when (and m (= (count m) (count (set (vals m)))))
      m)))

(defn- rewrite-agg-refs-to-cross-stage-fields
  "Postwalk: replace every `[aggregation, opts, <uuid>]` clause whose uuid is in
  `uuid->col-name` with the canonical cross-stage `[field, {}, <col-name>]` shape.
  Aggregation-specific opts (`base-type`, `effective-type`, `lib/uuid`) are intentionally
  dropped - downstream Pass 5 (`infer-cross-stage-field-types*`) will re-stamp the field's
  types based on metadata."
  [form uuid->col-name]
  (walk/postwalk
   (fn [n]
     (if (and (vector? n)
              (= 3 (count n))
              (= "aggregation" (nth n 0))
              (map? (nth n 1))
              (string? (nth n 2))
              (contains? uuid->col-name (nth n 2)))
       ["field" {} (get uuid->col-name (nth n 2))]
       n))
   form))

(defn- split-post-agg-filter-stage
  "Detect post-agg-filter shape in `stage`. Return `[stage]` if no split is needed, or
  `[stage' new-stage]` if the stage was split. Throws `:agent-error?` ex-info when split is
  required but unsafe to perform automatically.

  Auto-fix is intentionally narrow: it moves the offending filter(s) into a second stage and
  rewrites their agg-refs to cross-stage `[\"field\" {} \"<col-name>\"]` clauses. It does
  NOT move `order-by` / `limit` / `fields` — those frequently reference pre-aggregation
  columns that don't survive the split, and silently relocating them produces either a
  hard-to-diagnose 'no matching field' error or, worse, a different-row-count query. When
  any of those keys is present we refuse and ask the LLM to author two stages explicitly."
  [stage]
  (let [aggs              (get stage "aggregation")
        same-stage-uuids  (collect-stage-agg-uuids stage)]
    (if-not (and (vector? aggs) (seq aggs) (seq same-stage-uuids))
      [stage]
      (let [filters             (get stage "filters")
            offending-filter?   (fn [f] (form-references-stage-agg? f same-stage-uuids))
            offending-filters   (when (vector? filters) (filterv offending-filter? filters))]
        (cond
          (empty? offending-filters)
          [stage]

          (or (seq (get stage "order-by"))
              (some? (get stage "limit"))
              (seq (get stage "fields")))
          (throw (ex-info
                  (tru "Detected a post-aggregation filter alongside `order-by:`, `limit:`, or `fields:` in the same stage. pMBQL requires the filter in a separate stage, but those trailing clauses cannot be safely relocated — they may reference pre-aggregation columns that don''t survive the split. Please author this as two stages explicitly: stage 0 with `source-table`, `aggregation`, `breakout`, and any pre-aggregation `filters`; stage 1 with the post-aggregation `filters`, plus `order-by` / `limit` / `fields` that reference the aggregation''s output via cross-stage `[\"field\", (empty opts), \"<column-name>\"]` refs.")
                  {:agent-error? true
                   :error        :post-agg-filter-with-trailing-clauses
                   :stage        stage}))

          :else
          (if-let [uuid->col (aggregation-uuid->column-name aggs)]
            (let [keep-filters  (vec (remove offending-filter? filters))
                  rewrite       #(rewrite-agg-refs-to-cross-stage-fields % uuid->col)
                  moved-filters (mapv rewrite offending-filters)
                  s0            (cond-> stage
                                  true                  (assoc "filters" keep-filters)
                                  (empty? keep-filters) (dissoc "filters"))
                  s1            {"lib/type" "mbql.stage/mbql"
                                 "filters"  moved-filters}]
              [s0 s1])
            (throw (ex-info
                    (tru "Detected a post-aggregation filter (a filter referencing an aggregation from the same stage). pMBQL requires this in a separate stage. Auto-fix is unsafe here — either an aggregation''s output column name cannot be derived (e.g. a `metric` reference or unknown head), or two aggregations in this stage would produce the same column name (e.g. two `sum` aggregations on different fields, which lib disambiguates as `sum` / `sum_2` based on field order). Please refactor to multi-stage manually: put the aggregations in stage 0, and the filter in stage 1 referencing the column via a cross-stage `[\"field\", (empty opts), \"<column-name>\"]` clause. Use an explicit aggregation with a `name` opts override (e.g. `[\"sum\", (opts with key \"name\" → \"sum_total\"), …]`) if you need stable cross-stage names.")
                    {:agent-error? true
                     :error        :post-agg-filter-needs-multi-stage
                     :stage        stage}))))))))

(defn- split-post-agg-filters*
  "Top-level pass: walk every stage in the query, expanding any post-agg-filter stage
  in-place to `[stage0 stage1]`. Re-runs are no-ops (idempotent: split stages no longer
  match the trigger)."
  [query]
  (if-not (and (map? query) (vector? (get query "stages")))
    query
    (update query "stages" #(into [] (mapcat split-post-agg-filter-stage) %))))

;;; ============================================================
;;; Pass 3 -- auto-wire `source-field` for implicit joins
;;;
;;; When a field clause references a field on a table *other* than the stage's
;;; `source-table`, and there is exactly one foreign key from the source table to that target
;;; table, fill in the `source-field` option with the portable FK of the FK column. The QP
;;; interprets this as an implicit join (the same machinery users get from the notebook UI).
;;;
;;; The pass walks stage[0] only, skips descent into the `\"joins\"` subtree (field clauses
;;; inside a join live in a join context), and is a no-op on clauses that already carry any
;;; of the disambiguating opts: `source-field`, `source-field-name`, `source-field-join-alias`,
;;; or `join-alias`. The latter three are LLM-authored variants we do *not* auto-fill:
;;; correctly filling them in would require resolving a previous-stage's returned-columns or
;;; an explicit-join's FK shape, neither of which is in scope for this pass.
;;; ============================================================

(defn- field-clause?
  "A repaired field clause of shape `[\"field\" <opts-map> <portable-fk-vector>]`. We require the
  opts map to be a real map and the portable FK to be a vector of >= 4 elements (DB, SCHEMA,
  TABLE, FIELD, …)."
  [v]
  (and (vector? v)
       (not (map-entry? v))
       (>= (count v) 3)
       (= "field" (nth v 0))
       (map? (nth v 1))
       (let [fk (nth v 2)]
         (and (vector? fk) (>= (count fk) 4)))))

(defn- try-resolve-source-table-id
  "Resolve the stage's `source-table` portable FK to a numeric id. Returns nil on any failure
  (unknown DB, unknown table, nil source-table, wrong shape, etc.) - implicit-join repair is
  best-effort and should never mask an error that the downstream validate/resolve passes will
  surface with a better message."
  [import-resolver source-table-fk]
  (try
    (when (and import-resolver (vector? source-table-fk) (= 3 (count source-table-fk)))
      (resolve/import-table-fk import-resolver source-table-fk))
    (catch Exception _ nil)))

(defn- try-resolve-field-target-table-id
  "Resolve the target-table-id of a portable field FK, by looking up the field and following its
  `:table-id`. Walks JSON-unfolded parent chains via the resolver's `import-field-fk`. Returns
  nil on failure."
  [mp import-resolver field-fk]
  (try
    (when-let [fid (resolve/import-field-fk import-resolver field-fk)]
      (:table-id (lib.metadata.protocols/field mp fid)))
    (catch Exception _ nil)))

(defn- export-source-field-portable
  "Convert a numeric FK column id into its portable `[db schema table field …]` path, via the
  MP-backed export resolver. Returns nil on failure."
  [export-resolver source-field-id]
  (try
    (resolve/export-field-fk export-resolver source-field-id)
    (catch Exception _ nil)))

(defn- display-source-table [mp source-table-id]
  (try
    (let [t (lib.metadata.protocols/table mp source-table-id)]
      (or (:name t) (str source-table-id)))
    (catch Exception _ (str source-table-id))))

(defn- display-portable [fk]
  (pr-str fk))

(defn- maybe-fill-source-field
  "Given a field-clause vector (already known to be a field clause), the stage's source-table-id,
  and the precomputed outbound-FK map, return either the original clause or a clause with
  `\"source-field\"` populated. Throws `:no-fk-path` or `:ambiguous-fk` on hard errors."
  [clause mp import-resolver export-resolver source-table-id outbound-fks-by-target]
  (let [opts (nth clause 1)
        fk   (nth clause 2)]
    (cond
      ;; Already disambiguated by the LLM. We leave any clause that carries one of the
      ;; implicit-/explicit-join disambiguators alone:
      ;;   * `source-field` — implicit join with FK column from the *source-table* (handled
      ;;     downstream by the resolver); we don't try to second-guess the LLM here.
      ;;   * `source-field-name` — implicit join from a *previous stage*'s output column
      ;;     (multi-stage); the FK column is referenced by name, not portable FK path.
      ;;   * `source-field-join-alias` — implicit join where the FK-bearing column lives on
      ;;     an *explicitly joined* table; the alias picks which copy of the FK to use.
      ;;   * `join-alias` — the field itself comes from an explicit join.
      (or (contains? opts "source-field")
          (contains? opts "source-field-name")
          (contains? opts "source-field-join-alias")
          (contains? opts "join-alias"))
      clause

      :else
      (let [target-table-id (try-resolve-field-target-table-id mp import-resolver fk)]
        (cond
          ;; Couldn't resolve target table: skip (validate/resolve will surface the real error).
          (nil? target-table-id)
          clause

          ;; Field is on the source table itself: nothing to do.
          (= target-table-id source-table-id)
          clause

          :else
          (let [candidates (get outbound-fks-by-target target-table-id)]
            (case (count candidates)
              0 (let [src-name (display-source-table mp source-table-id)
                      tbl-name (nth fk 2)]
                  (throw (ex-info (tru "Field {0} is on table {1} but there is no foreign key from the source table {2} to {3}. Either add an explicit joins: entry, or use a field from the source table."
                                       (display-portable fk)
                                       (pr-str tbl-name)
                                       (pr-str src-name)
                                       (pr-str tbl-name))
                                  {:status-code  400
                                   :error        :no-fk-path
                                   :agent-error? true
                                   :field        fk
                                   :source-table source-table-id
                                   :target-table target-table-id})))
              1 (let [{:keys [source-field-id]} (first candidates)
                      src-fk (export-source-field-portable export-resolver source-field-id)]
                  (if src-fk
                    (assoc clause 1 (assoc opts "source-field" src-fk))
                    clause))
              ;; Deliberately do NOT enumerate the candidate FK columns: the metadata provider
              ;; is un-sandboxed and any leaked `[db schema table field]` path could surface
              ;; bridge-table column names the caller is not permitted to see (`:agent-error?`
              ;; relays the message verbatim to the user). The LLM can recover by calling
              ;; `entity_details` on the source table to inspect available foreign-key columns.
              (let [src-name (display-source-table mp source-table-id)]
                (throw (ex-info (tru "Field {0} can be reached from {1} via {2} foreign keys. Specify the `source-field` option on the field clause to disambiguate; call `entity_details` on the source table to list the available foreign-key columns."
                                     (display-portable fk)
                                     (pr-str src-name)
                                     (count candidates))
                                {:status-code  400
                                 :error        :ambiguous-fk
                                 :agent-error? true
                                 :field        fk
                                 :source-table source-table-id
                                 :target-table target-table-id}))))))))))

(defn- resolve-implicit-joins-in-stage
  "Apply implicit-join repair to a single stage map (string-keyed). Returns an updated stage.

  Skips descent into the `\"joins\"` subtree by plucking it out before the postwalk and
  restoring it afterwards - field clauses inside explicit joins are expected to carry a
  `join-alias` already."
  [stage mp import-resolver export-resolver]
  (let [source-table-fk (get stage "source-table")
        source-table-id (try-resolve-source-table-id import-resolver source-table-fk)]
    (if-not source-table-id
      ;; Can't resolve source-table: skip the pass and let validate/resolve surface the error.
      stage
      (let [outbound  (resolve.mp/outbound-fks-from-table mp source-table-id)
            by-target (group-by :target-table-id outbound)
            joins     (get stage "joins")
            stage'    (cond-> stage (contains? stage "joins") (dissoc "joins"))
            walked    (walk/postwalk
                       (fn [node]
                         (if (field-clause? node)
                           (maybe-fill-source-field node mp import-resolver export-resolver
                                                    source-table-id by-target)
                           node))
                       stage')]
        (cond-> walked
          (contains? stage "joins") (assoc "joins" joins))))))

(defn- resolve-implicit-joins*
  "Top-level implicit-join pass. Only `stages[0]` participates: implicit-join `source-field`
  inference is a relationship from a stage's `source-table` to a sibling table via a single FK,
  and only the first stage of a query has a `source-table` of its own. Stages 1+ feed off the
  previous stage's output, where field references are by string name (handled by
  [[infer-cross-stage-field-types*]] further down)."
  [query mp content-store]
  (if-not (and mp (map? query) (vector? (get query "stages")) (seq (get query "stages")))
    query
    (let [import-resolver (resolve.mp/import-resolver mp content-store)
          export-resolver (resolve.mp/export-resolver mp)]
      (update-in query ["stages" 0] resolve-implicit-joins-in-stage
                 mp import-resolver export-resolver))))

;;; ============================================================
;;; Pass 3.5 -- auto-wire `source-field-join-alias` for implicit joins through an explicitly
;;; joined table.
;;;
;;; Trigger: a field clause `["field" {opts} <portable-fk>]` whose target table is reachable
;;; from **exactly one** explicit join's source table via **exactly one** FK, and which the
;;; basic implicit-join pass (Pass 4) cannot handle (target not reachable from `source-table`,
;;; or LLM clearly intended to hop through the join).
;;;
;;; This is the moral equivalent of Pass 4 but the FK-bearing column lives on a joined table
;;; rather than on `source-table`. We refuse to second-guess any clause that already carries
;;; one of `source-field` / `source-field-name` / `source-field-join-alias` / `join-alias`.
;;;
;;; Conservative on purpose - per `repr-deletion-followups.md`, repair is opt-in: we fill in
;;; the unambiguous cases and bail loudly on ambiguity rather than guessing. The companion
;;; multi-stage `source-field-name` repair is *not* implemented here (it would require
;;; resolving a previous-stage's returned-columns from inside repair, which is structurally
;;; awkward and prone to silent corruption); see `repr-deletion-followups.md` for the
;;; deferred-with-rationale entry.
;;;
;;; Like Pass 4: walks `stages[0]` only, skips descent into the `\"joins\"` subtree (those
;;; field clauses already need `join-alias`), no-op when source-table or any join's
;;; source-table can't be resolved.
;;; ============================================================

(defn- explicit-join-source-tables
  "For each entry in a stage's `\"joins\"` vector, return
  `[{:alias <string>, :source-table-id <int>} …]`. Skips joins without a usable alias or whose
  `source-table` portable FK can't be resolved - they don't participate in repair, but the
  resolver will surface the structural error itself."
  [import-resolver joins]
  (vec (for [j     joins
             :let  [a   (get j "alias")
                    stf (get-in j ["stages" 0 "source-table"])
                    tid (try-resolve-source-table-id import-resolver stf)]
             :when (and (string? a) (seq a) tid)]
         {:alias a :source-table-id tid})))

(defn- candidates-via-explicit-join
  "Find every `(join-alias, source-field-id)` pair through which `target-table-id` is reachable
  from one of the explicit joins on the stage. Returns a vector (possibly empty) of
  `{:alias <string>, :source-field-id <int>}`.

  An entry is included iff the joined table has **exactly one** outbound FK to
  `target-table-id`. Multiple FKs from the same joined table are intentionally NOT collapsed
  into a single candidate - we can't tell which one the LLM meant, so we leave that join out
  of the candidate list (it'll either be unambiguous through some *other* join or fail loud
  below)."
  [mp joined-tables target-table-id]
  (vec (for [{:keys [alias source-table-id]} joined-tables
             :let [outbound  (resolve.mp/outbound-fks-from-table mp source-table-id)
                   matching  (filter #(= target-table-id (:target-table-id %)) outbound)]
             :when (= 1 (count matching))]
         {:alias            alias
          :source-field-id  (:source-field-id (first matching))})))

(defn- maybe-fill-source-field-join-alias
  "Given a field clause known to lack all four disambiguators, the resolved source-table-id of
  the stage, the resolved joined-table list, and the FK map for the stage's own source-table,
  decide whether to fill in `source-field-join-alias` (and the accompanying portable
  `source-field`).

  We only intervene when the basic implicit-join (Pass 4) would NOT handle the clause,
  i.e. the target is not the source-table itself and not reachable through `source-table`'s
  outbound FKs. Otherwise we leave the clause for Pass 4 - which has clearer error messages
  and is the canonical path for the common case.

  Throws `:ambiguous-fk-via-join` (an `:agent-error?`) when the target is reachable from
  multiple distinct join aliases. Returns the (possibly-augmented) clause otherwise."
  [clause mp import-resolver export-resolver source-table-id outbound-from-source-by-target joined-tables]
  (let [opts (nth clause 1)
        fk   (nth clause 2)]
    (if (or (contains? opts "source-field")
            (contains? opts "source-field-name")
            (contains? opts "source-field-join-alias")
            (contains? opts "join-alias"))
      clause
      (let [target-table-id (try-resolve-field-target-table-id mp import-resolver fk)]
        (cond
          (nil? target-table-id)              clause
          (= target-table-id source-table-id) clause
          ;; Pass 4 can handle this one - leave it alone.
          (seq (get outbound-from-source-by-target target-table-id)) clause

          :else
          (let [cands (candidates-via-explicit-join mp joined-tables target-table-id)]
            (case (count cands)
              ;; No explicit join provides a single-FK route either - let Pass 4 raise its
              ;; own `:no-fk-path` error with its current wording.
              0 clause
              1 (let [{:keys [alias source-field-id]} (first cands)
                      src-fk (export-source-field-portable export-resolver source-field-id)]
                  (if src-fk
                    (assoc clause 1 (assoc opts
                                           "source-field"            src-fk
                                           "source-field-join-alias" alias))
                    clause))
              ;; Alias names came from the LLM's own input (the `joins:` block it authored),
              ;; so listing them in the diagnostic is fine. The FK column portables are NOT
              ;; surfaced here — see the rationale on `:ambiguous-fk` above.
              (let [aliases (mapv :alias cands)]
                (throw (ex-info (tru "Field {0} is reachable from {1} explicit joins via aliases {2}. Specify the `source-field-join-alias` option on the field clause to pick which join''s foreign key to use."
                                     (display-portable fk)
                                     (count cands)
                                     (str/join ", " (map pr-str aliases)))
                                {:status-code  400
                                 :error        :ambiguous-fk-via-join
                                 :agent-error? true
                                 :field        fk
                                 :target-table target-table-id
                                 :aliases      aliases}))))))))))

(defn- resolve-source-field-join-alias-in-stage
  [stage mp import-resolver export-resolver]
  (let [source-table-fk (get stage "source-table")
        source-table-id (try-resolve-source-table-id import-resolver source-table-fk)
        joins           (get stage "joins")]
    (if-not (and source-table-id (vector? joins) (seq joins))
      stage
      (let [outbound          (resolve.mp/outbound-fks-from-table mp source-table-id)
            outbound-by-target (group-by :target-table-id outbound)
            joined-tables     (explicit-join-source-tables import-resolver joins)
            ;; As in Pass 4, do not descend into `joins:` subtree - clauses inside an explicit
            ;; join carry `join-alias` and have their own resolution context.
            stage'            (dissoc stage "joins")
            walked            (walk/postwalk
                               (fn [node]
                                 (if (field-clause? node)
                                   (maybe-fill-source-field-join-alias
                                    node mp import-resolver export-resolver
                                    source-table-id outbound-by-target joined-tables)
                                   node))
                               stage')]
        (assoc walked "joins" joins)))))

(defn- resolve-source-field-join-alias*
  "Top-level pass: fill in `source-field-join-alias` (+ accompanying `source-field`) on
  `stages[0]` field clauses whose target is reachable through exactly one explicit join. See
  the section header above for the full contract.

  Runs *before* [[resolve-implicit-joins*]] so that any clause it augments is already
  disambiguated by the time Pass 4 sees it (Pass 4 leaves clauses with any of the four
  disambiguators alone). Best-effort: any failure to resolve `source-table` or a joined
  table's `source-table` simply skips the pass."
  [query mp content-store]
  (if-not (and mp (map? query) (vector? (get query "stages")) (seq (get query "stages")))
    query
    (let [import-resolver (resolve.mp/import-resolver mp content-store)
          export-resolver (resolve.mp/export-resolver mp)]
      (update-in query ["stages" 0] resolve-source-field-join-alias-in-stage
                 mp import-resolver export-resolver))))

;;; ============================================================
;;; Pass 4 -- infer base-type / effective-type on cross-stage field references
;;;
;;; A cross-stage field reference looks like `["field" {opts} "<column-name>"]` where the
;;; third element is a **string** (the column's name in the previous stage's output) rather
;;; than a portable FK vector. The lib-schema for `:mbql.clause/field` requires the options
;;; map to carry `:base-type` whenever the id-or-name argument is a string - and LLMs
;;; routinely forget this, even though they're great at picking the right column name.
;;;
;;; Strategy:
;;;   * Walk stages left-to-right.
;;;   * Before processing stage `i` (i ≥ 1), build a mini-query consisting of stages[0..i-1]
;;;     and resolve it. Call `lib/returned-columns` on the result; index by `:name`.
;;;   * Walk stage[i] (skipping descent into `joins` subtrees - those have their own
;;;     resolution context). For every `["field" opts <string>]` clause:
;;;       - If `opts` already has `"base-type"`, leave it alone (idempotent).
;;;       - If the name is unknown to the previous stage, leave it alone (the resolver will
;;;         report the real error with a better message).
;;;       - Otherwise, stamp `"base-type"` (and `"effective-type"` when present) into the
;;;         options map.
;;;   * If the prefix can't be resolved (bad source-table, etc.), skip the rest of the pass
;;;     - again, the resolver will surface the structural problem.
;;;
;;; The mini-resolve is potentially O(N) over stages, but in practice N ≤ a handful, the MP
;;; is cached, and we only do this for queries that actually have multiple stages.
;;; ============================================================

(defn- string-cross-stage-field-clause?
  "`[\"field\" <opts-map> <string>]` - a cross-stage column reference by name. We require
  the opts map to be a real map and the third element to be a non-blank string. Anything else
  (FK vector, missing slot, non-map opts) is left to [[field-clause?]] / the resolver."
  [v]
  (and (vector? v)
       (not (map-entry? v))
       (= 3 (count v))
       (= "field" (nth v 0))
       (map? (nth v 1))
       (non-blank-string? (nth v 2))))

(defn- types-from-column
  "Pull `\"base-type\"` (and optionally `\"effective-type\"`) off a `lib/returned-columns`
  metadata map, in the string-keyed form that matches the rest of the repair pipeline.
  Returns `nil` if the column has no `:base-type` we can use."
  [col]
  (when-let [bt (:base-type col)]
    (let [bt-str (if (keyword? bt) (subs (str bt) 1) (str bt))]
      (cond-> {"base-type" bt-str}
        (:effective-type col)
        (assoc "effective-type" (let [et (:effective-type col)]
                                  (if (keyword? et) (subs (str et) 1) (str et))))))))

(defn- mini-resolved-columns-by-name
  "Resolve `stages[0..idx-1]` as a self-contained query, run it through `lib/query`, and return
  a `{column-name → {\"base-type\" ..., \"effective-type\" ...}}` map for the columns the
  prefix returns.

  Returns `nil` (logged at debug) if anything in the resolve / lib/query path throws. The
  enclosing pass treats `nil` as 'skip this stage's repairs and let downstream surface the real
  error'."
  [mp query stage-idx content-store]
  (try
    (let [prefix-stages (subvec (get query "stages") 0 stage-idx)
          prefix-query  (assoc query "stages" prefix-stages)
          resolved      (repr.resolve/resolve-query mp prefix-query content-store)
          lib-q         (lib/query mp resolved)
          cols          (lib/returned-columns lib-q)]
      (into {}
            (keep (fn [col]
                    (when-let [types (types-from-column col)]
                      [(:name col) types])))
            cols))
    (catch Exception e
      (log/debugf e "[repr-repair] mini-resolve of stages[0..%d] failed; skipping cross-stage type inference for stage %d"
                  (dec stage-idx) stage-idx)
      nil)))

(defn- strip-surrounding-double-quotes
  "If `s` is wrapped in a matched pair of leading/trailing double-quote characters, return the
  inner string; otherwise return `s` unchanged.

  LLMs sometimes quote a cross-stage / source-card column name the way they'd quote a SQL
  identifier - e.g. `\"app_id\"` - but those quotes are not part of the column's actual name.
  Left in place they make the name match no source column, so the [[maybe-fill-cross-stage-types]]
  pass can't infer `base-type`, the resolver passes the typeless string-named ref through
  unvalidated (production has Malli instrumentation off), and the FE later crashes computing
  display info for it."
  [s]
  (or (when (string? s)
        (second (re-matches #"\"(.*)\"" s)))
      s))

(defn- normalize-col-key
  "Loose matching key for an LLM-authored cross-stage column name: lowercased, with hyphens and
  whitespace folded to underscores. Lets the natural `count-where` (or `Count Where`) the LLM
  tends to write match the canonical `count_where` that lib emits as an aggregation's output
  column name - so the model doesn't have to memorise the hyphen-vs-underscore output-naming
  rule."
  [s]
  (when (string? s)
    (-> s u/lower-case-en (str/replace #"[-\s]+" "_"))))

(defn- match-cross-stage-column
  "Find the canonical column entry in `name->types` for `col-name`. Returns `[canonical-name
  types]` or `nil` when no column matches.

  Tries, in order:
    1. an exact match;
    2. the double-quote-stripped name (only when stripping actually resolves);
    3. a loose match that folds case and hyphens/whitespace to underscores, but **only when
       exactly one** real column matches - so `count-where` resolves to `count_where` while
       genuine ambiguity is left for the resolver to report.

  A column whose name legitimately needs quotes (vanishingly rare) is never clobbered, and
  unmatched names are passed through for the resolver to surface with a better message."
  [name->types col-name]
  (let [stripped (strip-surrounding-double-quotes col-name)]
    (cond
      (contains? name->types col-name)
      [col-name (get name->types col-name)]

      (and (not= stripped col-name) (contains? name->types stripped))
      [stripped (get name->types stripped)]

      :else
      (let [target (normalize-col-key stripped)
            hits   (when target
                     (filter #(= target (normalize-col-key %)) (keys name->types)))]
        (when (= 1 (count hits))
          (let [canon (first hits)]
            [canon (get name->types canon)]))))))

(defn- maybe-fill-cross-stage-types
  "Given a cross-stage field clause and a name→types map, return the clause with its column name
  canonicalised (surrounding double-quotes stripped when that is what makes it match a real
  column) and `base-type` / `effective-type` filled in (when missing and known).

  Idempotent: once the name is canonical it matches exactly on the next pass (no rename), and
  once `base-type` is present it is left alone."
  [clause name->types]
  (let [opts     (nth clause 1)
        col-name (nth clause 2)]
    (if-let [[canonical-name types] (match-cross-stage-column name->types col-name)]
      (cond-> clause
        ;; Canonicalise the name when quote-stripping was needed to match. A bare `base-type`
        ;; stamp without this would leave the ref pointing at a non-existent column.
        (not= canonical-name col-name)
        (assoc 2 canonical-name)
        ;; Stamp inferred types only when the LLM didn't author a `base-type` already.
        (not (contains? opts "base-type"))
        (assoc 1 (merge opts types)))
      clause)))

(defn- infer-cross-stage-field-types-in-stage
  "Walk one stage and stamp inferred types into every string-named field reference that lacks
  `\"base-type\"`. Skips descent into `\"joins\"` subtrees - join stages have their own
  resolution context (the join's own `stages`) and shouldn't reach into their parent stage's
  previous-stage columns."
  [stage name->types]
  (let [joins  (get stage "joins")
        stage' (cond-> stage (contains? stage "joins") (dissoc "joins"))
        walked (walk/postwalk
                (fn [node]
                  (if (string-cross-stage-field-clause? node)
                    (maybe-fill-cross-stage-types node name->types)
                    node))
                stage')]
    (cond-> walked
      (contains? stage "joins") (assoc "joins" joins))))

(defn- mini-resolved-columns-for-source-card
  "Resolve a single-stage query consisting only of `{:source-card <entity-id>}` (plus the
  outer `mbql/query` wrapper and the warehouse database name), then return the
  `lib/returned-columns` output as a `name → types` map in the same shape as
  [[mini-resolved-columns-by-name]]. Used by [[infer-source-card-field-types*]] to stamp
  `base-type` onto `[field, {}, \"<col>\"]` clauses in a stage whose source is a saved
  question / model.

  Returns `nil` if anything in the resolve path throws - the resolver will surface the real
  error on the main pipeline. Logged at debug."
  [mp query stage-idx content-store]
  (let [stage (get-in query ["stages" stage-idx])]
    (when-let [source-card (get stage "source-card")]
      (try
        (let [bare-stage {"lib/type"    "mbql.stage/mbql"
                          "source-card" source-card}
              bare-query {"lib/type" "mbql/query"
                          "database" (get query "database")
                          "stages"   [bare-stage]}
              resolved   (repr.resolve/resolve-query mp bare-query content-store)
              lib-q      (lib/query mp resolved)
              cols       (lib/returned-columns lib-q)]
          (into {}
                (keep (fn [col]
                        (when-let [types (types-from-column col)]
                          [(:name col) types])))
                cols))
        (catch Exception e
          (log/debugf e "[repr-repair] source-card resolve of stage %d failed; skipping field-type inference"
                      stage-idx)
          nil)))))

(defn- infer-source-card-field-types*
  "Stamp `base-type` / `effective-type` onto `[field, opts, \"<col>\"]` clauses in any stage
  whose source is a `source-card:` entity. Uses the card's resolved `returned-columns` as the
  type oracle.

  Idempotent and silently no-ops when `mp` is nil, the query shape is off, the card can't be
  resolved, or the column name isn't one the card produces (resolver will report the real
  error downstream)."
  [query mp content-store]
  (if-not (and mp (map? query) (vector? (get query "stages")))
    query
    (let [n (count (get query "stages"))]
      (loop [i 0
             q query]
        (if (>= i n)
          q
          (let [stage (get-in q ["stages" i])
                q'    (if (and (map? stage) (get stage "source-card"))
                        (if-let [name->types (mini-resolved-columns-for-source-card mp q i content-store)]
                          (update-in q ["stages" i] infer-cross-stage-field-types-in-stage name->types)
                          q)
                        q)]
            (recur (inc i) q')))))))

(defn- infer-cross-stage-field-types*
  "Top-level cross-stage field-type inference pass. No-op when the query has fewer than two
  stages or `mp` is nil."
  [query mp content-store]
  (if-not (and mp
               (map? query)
               (vector? (get query "stages"))
               (>= (count (get query "stages")) 2))
    query
    (let [n (count (get query "stages"))]
      (loop [i 1
             q query]
        (if (>= i n)
          q
          (let [name->types (mini-resolved-columns-by-name mp q i content-store)
                q'          (if name->types
                              (update-in q ["stages" i] infer-cross-stage-field-types-in-stage name->types)
                              q)]
            (recur (inc i) q')))))))

;;; ============================================================
;;; Pass 6 -- friendly error messages for silently-accepted-but-wrong shapes.
;;;
;;; lib's schema is intentionally shape-only and does not catch a number of patterns where
;;; the LLM clearly meant something else. Without a friendly diagnostic the broken query
;;; goes through validate, resolve, and only fails at SQL-generation time (or, worse,
;;; silently produces wrong results). Each detector below targets a *specific* pattern
;;; observed in production / sexp-pipeline telemetry and throws an `:agent-error?` ex-info
;;; with an LLM-actionable explanation.
;;;
;;; Carried over from the sexp pipeline's `validate/operators.clj` and
;;; `validate/cross_checks.clj` (see `repr-deletion-followups.md` § 2.3) plus a few new
;;; "silent failure" cases discovered while reviewing repr behaviour.
;;;
;;; This pass runs LAST in `repair`, after every shape pass and every mp-aware fill-in,
;;; so that we don't false-positive on shapes that are about to be repaired by an earlier
;;; pass.
;;; ============================================================

;;; ----- E1: `[field, …]` as an entry in a stage's `aggregation:` block ---------------

(defn- aggregation-entry-not-aggregation-error!
  "Detect a top-level `[field, …]` clause directly inside a stage's `aggregation:` vector.
  An aggregation entry must be an actual aggregation function (`count`, `sum`, `avg`,
  `metric`, …) or wrap a field in one (`[sum, opts, <field>]`). Lib accepts the
  field-as-aggregation shape silently and the QP produces wrong-result SQL.

  Throws `:agent-error?` ex-info on the *first* offending entry, naming the stage and
  entry index so the LLM can fix it precisely. Does NOT recurse into nested clauses
  (`[sum, {}, [field, …]]` is correct - the outer `sum` is the aggregation; the inner
  `field` is its argument)."
  [stage stage-idx]
  (when-let [aggs (get stage "aggregation")]
    (when (vector? aggs)
      (doseq [[entry-idx entry] (map-indexed vector aggs)]
        (when (and (vector? entry)
                   (>= (count entry) 1)
                   (= "field" (nth entry 0)))
          (throw (ex-info
                  (tru "Stage {0} aggregation entry {1} is a `field` clause, not an aggregation. The `aggregation:` block expects aggregation functions like `count`, `sum`, `avg`, `metric`, etc. - or wrap the field in one (e.g. `[sum, <opts>, <field>]`). If you wanted to group by this column, use `breakout:` instead."
                       stage-idx entry-idx)
                  {:agent-error? true
                   :error        :aggregation-entry-not-aggregation
                   :stage-index  stage-idx
                   :entry-index  entry-idx
                   :entry        entry})))))))

;;; ----- E2: `case` / `if` with `"default"` in opts ------------------------------------

(defn- case-default-in-opts-error!
  "Detect a `case` / `if` clause whose options map carries a `\"default\"` key. lib's
  canonical shape uses the *third positional argument* as the fallback, e.g.

      [case, {}, [[pred1 then1] [pred2 then2]], default-value]

  Some LLMs (especially those primed by JSON-Schema-style examples) put `default` into the
  options map instead. lib silently ignores the unknown opts key and the case clause
  evaluates to `null` for any branch miss - a wrong-result class of bug.

  Throws `:agent-error?` ex-info on the first offender. Carried over from the sexp
  pipeline's `validate/operators.clj/validate-operator-specific!` `case` branch."
  [form]
  (walk/postwalk
   (fn [node]
     (when (and (vector? node)
                (not (map-entry? node))
                (>= (count node) 2)
                (string? (nth node 0))
                (contains? #{"case" "if"} (nth node 0))
                (map? (nth node 1))
                (contains? (nth node 1) "default"))
       (throw (ex-info
               (tru "`case` (and `if`) uses its third positional argument as the fallback value, not a `default` key in the options map. Move the value out of the options map and append it as the third arg of the clause: `[case, <opts>, <branch-pairs>, <default>]`. Omit the third arg entirely if you have no fallback (the result will be null on miss).")
               {:agent-error? true
                :error        :case-default-in-opts
                :clause       node})))
     node)
   form))

;;; ----- E3: sexp-legacy top-level operations used as clause heads ---------------------

(def ^:private sexp-legacy-top-level-ops
  "Heads from the deleted sexp pipeline that used to be top-level *operations* (“verbs” at
  the program level), not nestable clauses. LLMs trained on the sexp era still occasionally
  emit these as clause heads. They have no equivalent in repr (which uses stage-level
  blocks: `aggregation:`, `filters:`, `breakout:`, `order-by:`, `expressions:`, `limit:`,
  `joins:`).

  Map from offending head to a one-liner suggesting the canonical replacement."
  {"aggregate" "In repr, aggregations live directly inside a stage's `aggregation:` block (no `aggregate` wrapper). Move the inner clauses into the stage's `aggregation: […]` vector."
   "filter"    "In repr, filters live directly inside a stage's `filters:` block. Move the inner clauses into the stage's `filters: […]` vector."
   "order-by"  "In repr, ordering lives directly inside a stage's `order-by:` block as `[asc|desc, <opts>, <ref>]` clauses. Move the inner clauses into the stage's `order-by: […]` vector."
   "breakout"  "In repr, breakouts (group-by) live directly inside a stage's `breakout:` block. Move the inner clauses into the stage's `breakout: […]` vector."
   "limit"     "In repr, the row limit is a scalar at the stage level: `limit: <n>`, not a clause."})

(defn- sexp-legacy-op-as-clause-error!
  "Detect any sexp-era top-level operation used as a clause head (`[aggregate, …]`,
  `[filter, …]`, etc.). lib accepts these silently because they look like generic
  unknown-but-shape-valid clauses; the resulting query produces wrong results or fails
  at SQL-generation time. Carried over from the sexp pipeline's
  `validate/operators.clj` `top-level-operation` branch.

  Excludes `map-entry?` nodes - postwalk descends into map entries, and a stage's
  `{\"breakout\" […]}` entry would otherwise look exactly like a `[\"breakout\", …]`
  clause to this detector."
  [form]
  (walk/postwalk
   (fn [node]
     (when (and (vector? node)
                (not (map-entry? node))
                (>= (count node) 1)
                (string? (nth node 0))
                (contains? sexp-legacy-top-level-ops (nth node 0)))
       (let [head (nth node 0)
             hint (get sexp-legacy-top-level-ops head)]
         (throw (ex-info
                 (tru "`{0}` is not a clause in repr; it was a top-level operation in the older sexp pipeline. {1}"
                      head hint)
                 {:agent-error? true
                  :error        :sexp-legacy-op-as-clause
                  :head         head
                  :clause       node}))))
     node)
   form))

;;; ----- E5: blank `[expression, opts, ""]` reference --------------------------------

(defn- blank-expression-ref-error!
  "Detect any `[expression, <opts>, <name>]` reference whose name slot is missing,
  blank, or non-string. lib's schema requires a non-blank string identifier here
  (matching an entry in some upstream stage's `expressions:` block); without it the
  reference resolves to nothing and the query produces wrong results or fails downstream.

  Carried over from the sexp pipeline's
  `validate/operators.clj/validate-operator-specific!` `expression-ref` branch."
  [form]
  (walk/postwalk
   (fn [node]
     (when (and (vector? node)
                (not (map-entry? node))
                (= 3 (count node))
                (= "expression" (nth node 0))
                (map? (nth node 1)))
       (let [name-slot (nth node 2)]
         (when (or (not (string? name-slot))
                   (= "" (str/trim (str name-slot))))
           (throw (ex-info
                   (tru "`[expression, <opts>, <name>]` reference requires a non-blank string identifier in the third slot, matching an entry in some stage''s `expressions:` block.")
                   {:agent-error? true
                    :error        :blank-expression-ref
                    :clause       node})))))
     node)
   form))

;;; ----- E6: numeric `[field, opts, 100]` (sexp legacy form) -------------------------

(defn- numeric-field-id-error!
  "Detect any `[field, <opts>, <id>]` clause whose third slot is an integer (the sexp /
  legacy-MBQL numeric field-id form). repr requires a portable FK in the third slot:
  either a vector `[<db>, <schema>, <table>, <column>]` (resolved against the metadata
  provider) OR a string column name (cross-stage reference). lib's schema rejects bare
  numeric ids, but the error is a generic shape mismatch; this detector gives an
  LLM-actionable explanation pointing at the portable-FK syntax.

  Carried over from the sexp pipeline's
  `validate/operators.clj/validate-operator-specific!` `field` branch."
  [form]
  (walk/postwalk
   (fn [node]
     (when (and (vector? node)
                (not (map-entry? node))
                (= 3 (count node))
                (= "field" (nth node 0))
                (map? (nth node 1))
                (integer? (nth node 2)))
       (throw (ex-info
               (tru "`field` clause needs a portable FK in its third slot, not a numeric id. Use a vector `[<database>, <schema>, <table>, <column>]` (resolved against the metadata provider) or a string column-name (for cross-stage references).")
               {:agent-error? true
                :error        :numeric-field-id
                :clause       node})))
     node)
   form))

;;; ----- friendly-errors pipeline driver -----------------------------------------------

(defn- friendly-errors*
  "Run every diagnostic detector in turn. Throws on the first match; otherwise returns
  `query` unchanged."
  [query]
  (when (and (map? query) (vector? (get query "stages")))
    (doseq [[idx stage] (map-indexed vector (get query "stages"))]
      (when (map? stage)
        (aggregation-entry-not-aggregation-error! stage idx)))
    (case-default-in-opts-error! query)
    (sexp-legacy-op-as-clause-error! query)
    (blank-expression-ref-error! query)
    (numeric-field-id-error! query))
  query)

;;; ============================================================
;;; Top-level entry point
;;; ============================================================

(defn- normalize-shape*
  "Pure-shape passes that don't require a metadata provider."
  [parsed]
  (-> parsed
      ;; Run before Pass 1 (`ensure-clause-options*`): a values-list like
      ;; `["alice" "bob"]` looks like a bare clause to Pass 1, which would corrupt it.
      normalise-list-value-comparisons*
      ensure-clause-options*
      unwrap-boolean-wrappers*
      unwrap-nested-field-clauses*
      dequote-field-targets*
      rewrite-operator-name-aliases*
      rewrite-temporal-bucket-aliases*
      rewrite-direction-aliases*
      rewrite-lib-type-aliases*
      merge-trailing-options*
      merge-string-filter-trailing-options*
      wrap-iso-date-bounds*
      wrap-now-literals*
      swap-between-bounds*
      normalise-case-clauses*
      normalise-fields-shape*
      normalize-expressions-shape*
      ensure-lib-types*))

(defn- stamp-top-level-database*
  "Idempotent wrapper around [[infer-top-level-database*]] that takes `[query mp]` in the
  arg order matching the other mp-taking passes below."
  [query mp]
  (infer-top-level-database* query mp))

(defn repair
  "Run the repair pipeline on a parsed (string-keyed, portable) representations query.

  Passes:
    1. ensure every clause vector has an options map at position 2;
    1.5. normalise `expressions:` shape - accept map form `{Name: clause, …}` or the
       canonical sequential form, always output sequential with `lib/expression-name`
       stamped into each clause's options from the map key when missing;
    1.75. strip stray surrounding double-quotes from the string segments of `field` clauses'
       portable-FK vector targets, e.g. `\"col\"` → `col` (cross-stage string targets are left
       to the resolution-aware cross-stage matching in pass 5);
    1.87. rewrite a known-misspelled `\"lib/type\"` marker to its canonical value (e.g. the
       join slip `\"mbql.join/join\"` → `\"mbql/join\"`);
    1.88. merge a trailing extra options-map back into position-1 options on fixed-arity
       tuple clauses (e.g. `[\"time-interval\" {} <expr> -1 \"month\" {\"include-current\" true}]`);
    2. fill in missing `\"lib/type\"` markers on the query, joins, and stages;
    3. rewrite inline aggregation expressions in `order-by` to aggregation references when
       they match an aggregation in the same stage's `aggregation:` list (synthesising the
       referenced aggregation's `lib/uuid` if needed);
    3.5. resolve 0-based integer aggregation references (`[aggregation, {}, <int>]`) in a
       stage to the canonical UUID-keyed MBQL 5 form, stamping `lib/uuid` on the target
       aggregation clause and `base-type`/`effective-type` on the ref's options;
    3.7. auto-wire `source-field-join-alias` (and the accompanying portable `source-field`)
       on field clauses whose target table is reachable through **exactly one** explicit
       join on the stage via a single unambiguous FK on the joined table. Skips clauses
       that already carry any of `source-field` / `source-field-name` /
       `source-field-join-alias` / `join-alias`. Raises `:ambiguous-fk-via-join` (an
       `:agent-error?`) when the target is reachable from multiple distinct join aliases.
       Runs *before* the basic implicit-join pass so the latter sees an already-
       disambiguated clause.
    4. auto-wire `source-field` on field clauses that reference a foreign table via a single
       unambiguous FK on the source table (implicit-join resolution);
    5. infer `base-type` / `effective-type` on cross-stage field references
       (`[\"field\" {} \"<column-name>\"]` in a non-first stage), by mini-resolving the
       prefix of stages and reading the returned columns' metadata.
    5.5. infer `base-type` / `effective-type` on field references in a stage whose source is
       a saved question / model (`source-card:`), using the card's resolved returned columns.

  Pass 4, Pass 5, and Pass 5.5 require `mp` (a `MetadataProvider`); they are best-effort
  no-ops when `mp` can't resolve the relevant pieces (so the subsequent validate/resolve
  stages can surface the real error with their own, better messages). Hard FK errors from
  Pass 4 (`:no-fk-path`, `:ambiguous-fk`) are raised as `:agent-error?` ex-info so the tool
  wrapper can relay them to the LLM. Pass 5 and Pass 5.5 never throw on their own - if a
  prefix / source-card can't be resolved, they just leave the affected clauses alone and let
  the schema validator complain.

  Note: the database-name normalisation pass (\"Pass 2.5\") that previously lived here was
  removed in `repr-plan.md` step 13, and the top-level `database:` field was removed from
  the LLM-facing contract in the step-14 follow-up. Database identity is now derived from
  the first stage's `source-table:` / `source-card:` (see
  [[metabase.metabot.tools.construct/resolve-database-id-from-first-stage]]), and Pass 1.9
  stamps `database:` from the MP into the parsed query so the downstream resolver and lib
  schema see a spec-compliant document.

  Guaranteed to be **idempotent**: `(= (repair mp q) (repair mp (repair mp q)))`. Pass 3
  satisfies idempotency by stamping a deterministic-once UUID into the matching aggregation
  (subsequent runs reuse it) and by leaving existing `[\"aggregation\" {} \"<uuid>\"]` refs
  alone. Pass 5 is idempotent because it skips any cross-stage clause whose options already
  contain `\"base-type\"`.

  The optional `content-store` is threaded into mini-resolve passes that touch saved cards;
  agent callers pass a permission-aware store so source-card/metric metadata is not read via
  the default app-DB resolver."
  ([mp parsed]
   (repair mp parsed resolve.mp/unchecked-app-db-content-store))
  ([mp parsed content-store]
   (-> parsed
       normalize-shape*
       (stamp-top-level-database* mp)
       rewrite-order-by-inline-aggs*
       resolve-aggregation-ref-indexes*
       split-post-agg-filters*
       (resolve-source-field-join-alias* mp content-store)
       (resolve-implicit-joins* mp content-store)
       (infer-cross-stage-field-types* mp content-store)
       (infer-source-card-field-types* mp content-store)
       friendly-errors*)))
