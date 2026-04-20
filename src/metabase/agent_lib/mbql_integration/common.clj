(ns metabase.agent-lib.mbql-integration.common
  "Common MBQL bridge helpers shared by agent-lib field, filter, and orderable integration."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn query?
  "Return true when `value` is a normalized pMBQL query map.

  Agent-lib needs to distinguish queries from metadata maps, columns, and test
  sentinels, but it should not inspect `:lib/type` directly. This helper keeps
  that boundary on top of `lib/normalized-query-type` and guards the lib call so
  non-query maps fail closed instead of blowing up.

  Example:
    (query? (lib/query metadata-provider table-metadata))
    ;; => true

    (query? {:id 1 :name \"Orders\"})
    ;; => false"
  [value]
  (and (map? value)
       (= :mbql/query (lib/normalized-query-type value))))

(defn extract-field-ids
  "Return the set of field ids referenced anywhere inside a pMBQL form.

  Agent-lib compares expressions, aggregations, breakouts, and columns
  semantically. The canonical lib helper already knows how to walk MBQL safely,
  so this wrapper keeps callers out of tuple destructuring.

  Example:
    (extract-field-ids
      [:+
       {}
       [:field {} 10]
       [:field {} 20]])
    ;; => #{10 20}"
  [x]
  (lib/all-field-ids x))

(defn expression-definition
  "Return `x` when it is a named expression definition, else nil.

  Agent-lib accepts both fully defined expressions and references to existing
  expressions. The MBQL layer already owns the naming rules, so this helper just
  asks lib whether the form has an expression name and otherwise leaves the
  structure alone.

  Example:
    (expression-definition
      [:expression {} \"Net Amount\"
       [:- {} [:field {} 1] [:field {} 2]]])
    ;; => that same tuple

    (expression-definition [:field {} 1])
    ;; => nil"
  [x]
  (when (lib.util/expression-name x)
    x))

(defn normalized-name
  "Normalize a display name for case-insensitive matching.

  Agent-lib compares program-provided names against MBQL column names, aliases,
  and ref names. Matching needs to be locale-stable, so this goes through
  `lower-case-en` instead of generic lowercase.

  Example:
    (normalized-name \"Net Amount\")
    ;; => \"net amount\"

    (normalized-name nil)
    ;; => nil"
  [value]
  (when (string? value)
    (u/lower-case-en value)))

(defn column-names
  "Return every comparable name by which a query column may be recognized.

  The same semantic column can surface through several lib metadata keys:
  `:name`, `:lib/source-column-alias`, `:lib/original-name`,
  `:lib/deduplicated-name`, and `:lib/ref-name`. Agent-lib collapses those into
  one normalized set so later matching logic can ask one question: \"does this
  column look like the requested thing?\"

  Example:
    (column-names {:name \"Title\"
                   :lib/source-column-alias \"product_title\"
                   :lib/ref-name \"Products -> Title\"})
    ;; => #{\"title\" \"product_title\" \"products -> title\"}"
  [column]
  (->> [(:name column)
        (:lib/source-column-alias column)
        (:lib/original-name column)
        (:lib/deduplicated-name column)
        (:lib/ref-name column)]
       (keep normalized-name)
       set))

(defn column-join-alias
  "Return the join alias attached to a visible/query column, if any.

  Lib can surface the active alias on `:lib/join-alias` or preserve the
  original alias on `:lib/original-join-alias`. Agent-lib only needs one answer
  when deciding whether a match came from an explicit join.

  Example:
    (column-join-alias {:lib/join-alias \"Products\"})
    ;; => \"Products\""
  [column]
  ((some-fn :lib/join-alias :lib/original-join-alias) column))

(defn- candidate-column-key
  [column]
  [(:id column)
   (:table-id column)
   (:name column)
   (:source-field column)
   (:source-field-name column)
   (:source-field-join-alias column)
   (column-join-alias column)
   (:fk-field-id column)
   (:fk-field-name column)
   (:fk-join-alias column)
   (:lib/original-fk-field-id column)
   (:lib/original-fk-field-name column)
   (:lib/original-fk-join-alias column)
   (:lib/source column)
   (:lib/source-uuid column)
   (:lib/expression-name column)
   (:lib/temporal-unit column)
   (:inherited-temporal-unit column)])

(defn dedupe-candidate-columns
  "Deduplicate candidate columns while preserving the first structurally
  distinct representative.

  Agent-lib merges columns from several lib surfaces such as `visible-columns`,
  `fieldable-columns`, and `orderable-columns`. The same semantic column often
  appears more than once. We collapse duplicates, but we keep join alias, FK
  lineage, source UUID, expression name, and temporal metadata in the key so we
  do not merge columns that only look similar.

  Example:
    (dedupe-candidate-columns
      [{:id 10 :name \"Title\"}
       {:id 10 :name \"Title\"}
       {:id 10 :name \"Title\" :lib/join-alias \"Products\"}])
    ;; => keeps the plain column and the joined column"
  [columns]
  (vals
   (reduce (fn [acc column]
             (let [k (candidate-column-key column)]
               (if (contains? acc k)
                 acc
                 (assoc acc k column))))
           {}
           columns)))

(defn current-query-field-candidates
  "Return the deduplicated field-like columns visible from the current query
  stage.

  Agent programs name semantic fields, but the current stage may expose them as
  visible columns, fieldable columns, filterable columns, breakoutable columns,
  or orderable columns. This helper builds the combined search space used by
  field resolution.

  Example:
    A field that is hidden from the result set but still filterable remains
    resolvable because this helper includes `lib/filterable-columns`."
  [query]
  (->> [(lib/fieldable-columns query)
        (lib/visible-columns query)
        (lib/filterable-columns query)
        (lib/breakoutable-columns query)
        (lib/orderable-columns query)]
       (apply concat)
       dedupe-candidate-columns
       vec))

(defn prefer-single-candidate
  "Return the single deterministic winner from an otherwise ambiguous candidate
  set, or nil when agent-lib should keep looking.

  This is the extracted tie-breaker used by `unique-query-candidate`:
  prefer one unaliased column over joined columns, then prefer one explicit
  field over an FK-derived expansion.

  Example:
    Given `[Orders.ID, Products.ID via implicit join]`, the unaliased
    `Orders.ID` candidate wins."
  [candidates]
  (or (when-let [unaliased (not-empty (remove column-join-alias candidates))]
        (when-not (next unaliased)
          (first unaliased)))
      (when-let [explicit (not-empty (remove :fk-field-id candidates))]
        (when-not (next explicit)
          (first explicit)))))

(defn unique-query-candidate
  "Return a single candidate after applying agent-lib's tie-break rules.

  Some lib lookups intentionally return more than one plausible column. When
  that happens, agent-lib prefers:
  1. a single unaliased column over a joined one
  2. a single column without FK lineage over a related-field expansion

  This keeps agent behavior deterministic without forcing callers to know the
  ranking policy.

  Example:
    If candidates are `[Orders.ID, Products.ID via implicit join]`, the plain
    `Orders.ID` column wins."
  [candidates]
  (or (when (= 1 (count candidates))
        (first candidates))
      (prefer-single-candidate (vec candidates))))

(defn field-selection?
  "Return true when `selection` behaves like a field for `with-fields`.

  `with-fields` in agent-lib accepts both literal field clauses and lib column
  maps that can be turned back into field refs. This helper centralizes that
  check so callers do not branch on raw ref tags.

  Example:
    (field-selection? [:field {} 10])
    ;; => true

    (field-selection? {:id 10 :name \"Title\"})
    ;; => true when `(lib/ref ...)` yields a field ref"
  [selection]
  (or (lib.util/field-clause? selection)
      (when (map? selection)
        (let [selection-ref (try
                              (lib/ref selection)
                              (catch Exception _
                                nil))]
          (boolean
           (or (some-> selection-ref lib/field-ref-id)
               (some-> selection-ref lib/field-ref-name)))))))

(defn resolve-aggregation-selection
  "Resolve an aggregation selection back to the visible current-stage column
  when one exists.

  Some agent operations conceptually choose \"the aggregated result column\",
  while the syntax still names it as an aggregation ref. When lib can map that
  ref to the visible column, we use the column so downstream helpers treat it
  like any other selected field.

  Example:
    Given a query with `(lib/aggregate (lib/count))`, resolving
    `(lib/aggregation-ref query 0)` returns the visible count column instead of
    leaving the raw ref in place."
  [query selection]
  (if (lib.util/clause-of-type? selection :aggregation)
    (or (lib/find-visible-column-for-ref query selection)
        selection)
    selection))
