(ns metabase.lib.equality
  "Logic for determining whether two pMBQL queries are equal."
  (:refer-clojure :exclude [=])
  (:require
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.u.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as memoize]))

(defmulti =
  "Determine whether two already-normalized pMBQL maps, clauses, or other sorts of expressions are equal. The basic rule
  is that two things are considered equal if they are [[clojure.core/=]], or, if they are both maps, if they
  are [[clojure.core/=]] if you ignore all qualified keyword keys besides `:lib/type`."
  {:arglists '([x y])}
  ;; two things with different dispatch values (for maps, the `:lib/type` key; for MBQL clauses, the tag, and for
  ;; everything else, the `:dispatch-type/*` key) can't be equal.
  (fn [x y]
    (let [x-dispatch-value (lib.dispatch/dispatch-value x)
          y-dispatch-value (lib.dispatch/dispatch-value y)]
      (if (not= x-dispatch-value y-dispatch-value)
        ::different-dispatch-values
        x-dispatch-value)))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod = ::different-dispatch-values
  [_x _y]
  false)

(defn- relevant-keys-set
  "Set of keys in a map that we consider relevant for [[=]] purposes."
  [m]
  (into #{}
        (remove (fn [k]
                  (and (qualified-keyword? k)
                       (not= k :lib/type))))
        (keys m)))

(defmethod = :dispatch-type/map
  [m1 m2]
  (let [m1-keys (relevant-keys-set m1)
        m2-keys (relevant-keys-set m2)]
    (and (clojure.core/= m1-keys m2-keys)
         (every? (fn [k]
                   (= (get m1 k)
                      (get m2 k)))
                 m1-keys))))

(defmethod = :dispatch-type/sequential
  [xs ys]
  (and (clojure.core/= (count xs) (count ys))
       (loop [[x & more-x] xs, [y & more-y] ys]
         (and (= x y)
              (or (empty? more-x)
                  (recur more-x more-y))))))

(def ^:private ^:dynamic *side->uuid->index* nil)

(defn- aggregation-uuid->index
  [stage]
  (into {}
        (map-indexed (fn [idx [_tag {ag-uuid :lib/uuid}]]
                       [ag-uuid idx]))
        (:aggregation stage)))

(defmethod = :mbql.stage/mbql
  [x y]
  (binding [*side->uuid->index* {:left (aggregation-uuid->index x)
                                 :right (aggregation-uuid->index y)}]
    ((get-method = :dispatch-type/map) x y)))

(defmethod = :aggregation
  [[x-tag x-opts x-uuid :as x] [y-tag y-opts y-uuid :as y]]
  (and (clojure.core/= 3 (count x) (count y))
       (clojure.core/= x-tag y-tag)
       (= x-opts y-opts)
       ;; If nil, it means we aren't comparing a stage, so just compare the uuid directly
       (if *side->uuid->index*
         (clojure.core/= (get-in *side->uuid->index* [:left x-uuid] ::no-left)
                         (get-in *side->uuid->index* [:right y-uuid] ::no-right))
         (clojure.core/= x-uuid y-uuid))))

;;; if we've gotten here we at least know the dispatch values for `x` and `y` are the same, which means the types will
;;; be the same.
(defmethod = :default
  [x y]
  (cond
    (map? x)        ((get-method = :dispatch-type/map) x y)
    (sequential? x) ((get-method = :dispatch-type/sequential) x y)
    :else           (clojure.core/= x y)))

(defn- update-options-remove-namespaced-keys [a-ref]
  (lib.options/update-options a-ref lib.schema.util/remove-namespaced-keys))

(defn- field-id-ref? [a-ref]
  (mbql.u.match/match-one a-ref
    [:field _opts (_id :guard pos-int?)]))

(mu/defn resolve-field-id :- lib.metadata/ColumnMetadata
  "Integer Field ID: get metadata from the metadata provider. If this is the first stage of the query, merge in
  Saved Question metadata if available.

  This doesn't really have a good home. It's used here and by [[metabase.lib.field]], but because it depends on eg.
  [[metabase.lib.card]] and [[metabase.lib.convert]] it can't go in [[metabase.lib.metadata.calculation]]."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-id     :- ::lib.schema.id/field]
  (merge
   (when (lib.util/first-stage? query stage-number)
     (when-let [card-id (lib.util/source-card-id query)]
       (when-let [card-metadata (lib.card/saved-question-metadata query card-id)]
         (m/find-first #(= (:id %) field-id)
                       card-metadata))))
   (try
     (lib.metadata/field query field-id)
     (catch #?(:clj Throwable :cljs :default) _
       nil))))

(mu/defn ^:private plausible-matches-for-name :- [:sequential lib.metadata/ColumnMetadata]
  [ref-name :- :string
   columns  :- [:sequential lib.metadata/ColumnMetadata]]
  (or (not-empty (filter #(= (:lib/desired-column-alias %) ref-name) columns))
      (filter #(= (:name %) ref-name) columns)))

(mu/defn ^:private plausible-matches-for-id :- [:sequential lib.metadata/ColumnMetadata]
  [ref-id :- :int
   columns  :- [:sequential lib.metadata/ColumnMetadata]]
  (filter #(= (:id %) ref-id) columns))

(mu/defn ^:private disambiguate-matches :- [:maybe lib.metadata/ColumnMetadata]
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential lib.metadata/ColumnMetadata]]
  (let [{:keys [join-alias]} (lib.options/options a-ref)]
    (if join-alias
      ;; a-ref has a :join-alias, match on that. Return nil if nothing matches.
      (m/find-first #(= (:source-alias %) join-alias) columns)
      ;; a-ref without :join-alias - if exactly one column has no :source-alias, that's the match.
      (if-let [no-alias (not-empty (remove :source-alias columns))]
        ;; At least 1 matching column with no :source-alias.
        (if (= (count no-alias) 1)
          (first no-alias)
          ;; More than 1, it's ambiguous.
          (throw (ex-info "Ambiguous match! Implement more logic in disambiguate-matches."
                          {:ref a-ref
                           :columns columns})))
        ;; No columns are missing :source-alias - fail to match.
        ;; TODO: I'm not certain this one is sound, but it's necessary to make `lib.join/select-home-column` work as
        ;; written. If this case causes issues, that logic may need rewriting.
        nil))))

(mu/defn find-matching-column :- [:maybe lib.metadata/ColumnMetadata]
  "Given `a-ref` and a list of `columns`, finds the column that best matches this ref.

  Matching is based on finding the basically plausible matches first, which is usually sufficient. If there are multiple
  plausible matches, they are disambiguated by the most important extra included in the `ref`. (`:join-alias` first,
  then `:temporal-unit`, etc.)

  - Integer IDs in the `ref` are matched by ID; this usually is unambiguous. In the case of multiple joins on one table,
    the `:join-alias` settles the question.
    - There may be broken cases where the ID must be resolved to a name or `:lib/desired-column-alias` and matched.
      `query` and `stage-number` are required for this case.
  - For string IDs, these are checked against `:lib/desired-column-alias` first.
    - If that doesn't match any columns, `:name` is compared next.
    - If that *still* doesn't match, and `query` and `stage-number` were supplied.

  Returns the column, or nil if no match is found."
  ([[ref-kind _opts ref-id :as a-ref] :- ::lib.schema.ref/ref
    columns                           :- [:sequential lib.metadata/ColumnMetadata]]
   (case ref-kind
     ;; Aggregations are referenced by the UUID of the column being aggregated.
     :aggregation  (->> columns
                        (filter #(= (:lib/source %) :source/aggregations))
                        (filter #(= (:lib/source-uuid %) ref-id))
                        first)
     ;; Expressions are referenced by name; fields by ID or name.
     (:expression
       :field)     (let [plausible (if (string? ref-id)
                                     (plausible-matches-for-name ref-id columns)
                                     (plausible-matches-for-id   ref-id columns))]
                     (case (count plausible)
                       0 nil
                       1 (first plausible)
                       (disambiguate-matches a-ref plausible)))
     (throw (ex-info "Unknown type of ref" {:ref a-ref}))))

  ([query                            :- [:maybe ::lib.schema/query]
    stage-number                     :- :int
    [ref-kind opts ref-id :as a-ref] :- ::lib.schema.ref/ref
    columns                          :- [:sequential lib.metadata/ColumnMetadata]]
   (or (find-matching-column a-ref columns)
       (when (and query (number? ref-id))
         (if-let [resolved (resolve-field-id query stage-number ref-id)]
           (find-matching-column (assoc a-ref 2 (or (:lib/desired-column-alias resolved)
                                                    (:name resolved)))
                                 columns))))))

(mu/defn find-matching-ref :- [:maybe ::lib.schema.ref/ref]
  "Given `column` and a list of `refs`, finds the ref that best matches this column.

  Throws if there are multiple, ambiguous matches.

  Returns the matching ref, or nil if no plausible matches are found."
  [column       :- lib.metadata/ColumnMetadata
   refs         :- [:sequential ::lib.schema.ref/ref]]
  (let [ref-tails (group-by last refs)
        matches   (or (some->> column :lib/source-uuid (get ref-tails) not-empty)
                      (not-empty (get ref-tails (:id column)))
                      (not-empty (get ref-tails (:lib/desired-column-alias column)))
                      (get ref-tails (:name column))
                      [])]
    (case (count matches)
      0 nil
      1 (first matches)
      (throw (ex-info "Ambiguous match: given column matches multiple refs"
                      {:column        column
                       :matching-refs matches})))))

(mu/defn find-column-indexes-for-refs :- [:sequential :int]
  "Given a list `haystack` of columns or refs, and a list `needles` of refs to searc for, this returns a list parallel
  to `needles` with the corresponding index into the `haystack`, or -1 if not found.

  DISCOURAGED: This is intended for use only by [[metabase.lib.js/find-column-indexes-from-legacy-refs]].
  Other MLv2 code should use [[find-matching-column]] if the `haystack` is columns, or
  [[find-matching-ref]] if it's refs."
  [query        :- ::lib.schema/query
   stage-number :- :int
   needles      :- [:sequential ::lib.schema.ref/ref]
   haystack     :- [:sequential lib.metadata/ColumnMetadata]]
  (for [needle needles]
    (or (find-matching-column query stage-number needle haystack)
        -1)))

;; TODO: Refactor this away. Handle legacy refs in `lib.js`, then call [[find-matching-column]] directly.
(mu/defn find-column-for-legacy-ref :- [:maybe lib.metadata/ColumnMetadata]
  "Like [[find-matching-column]], but takes a legacy MBQL reference. The name here is for consistency with other
  FE names for similar functions."
  ([query legacy-ref metadatas]
   (find-column-for-legacy-ref query -1 legacy-ref metadatas))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    legacy-ref   :- some?
    metadatas    :- [:maybe [:sequential lib.metadata/ColumnMetadata]]]
   (find-matching-column query stage-number (lib.convert/legacy-ref->pMBQL query stage-number legacy-ref) metadatas)))

(defn mark-selected-columns
  "Mark `columns` as `:selected?` if they appear in `selected-columns-or-refs`. Uses fuzzy matching with
  [[find-matching-column]].

  Example usage:

    ;; example (simplified) implementation of [[metabase.lib.field/fieldable-columns]]
    ;;
    ;; return (visibile-columns query), but if any of those appear in `:fields`, mark then `:selected?`
    (mark-selected-columns (visible-columns query) (:fields stage))"
  ([cols selected-columns-or-refs]
   (mark-selected-columns nil -1 cols selected-columns-or-refs))

  ([query stage-number cols selected-columns-or-refs]
   #?(:cljs (js/console.log "MSC" (map :lib/desired-column-alias cols) (map :lib/desired-column-alias selected-columns-or-refs)))
   (let [res (when (seq cols)
               (let [selected-refs          (mapv lib.ref/ref selected-columns-or-refs)
                     matching-selected-cols (into #{}
                                                  (map #(find-matching-column query stage-number % cols))
                                                  selected-refs)]
                 (mapv #(assoc % :selected? (contains? matching-selected-cols %)) cols)))]
     #?(:cljs (js/console.log "MSC out" (map (comp boolean :selected?) res)))
     res)))
