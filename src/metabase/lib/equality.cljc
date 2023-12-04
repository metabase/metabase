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
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   #?@(:clj ([metabase.util.log :as log]))))

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

(mu/defn resolve-field-id :- ::lib.schema.metadata/column
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
         (m/find-first #(clojure.core/= (:id %) field-id)
                       card-metadata))))
   (try
     (lib.metadata/field query field-id)
     (catch #?(:clj Throwable :cljs :default) _
       nil))))

(mu/defn ^:private column-join-alias :- [:maybe :string]
  [column :- ::lib.schema.metadata/column]
  ((some-fn :metabase.lib.join/join-alias :source-alias) column))

(mu/defn ^:private matching-join? :- :boolean
  [[_ref-kind {:keys [join-alias source-field]} _ref-id] :- ::lib.schema.ref/ref
   column                                                :- ::lib.schema.metadata/column]
  ;; If the ref has a source-field, and it matches the column's :fk-field-id then this is an implicitly joined field.
  ;; Implicitly joined columns have :source-alias ("PRODUCTS__via__PRODUCT_ID") but the refs don't have any join alias.
  (or (and source-field
           (clojure.core/= source-field (:fk-field-id column)))
      ;; If it's not an implicit join, then either the join aliases must match for an explicit join, or both be nil for
      ;; an own column.
      (clojure.core/= (column-join-alias column) join-alias)))

(mu/defn ^:private plausible-matches-for-name :- [:sequential ::lib.schema.metadata/column]
  [[_ref-kind _opts ref-name :as a-ref] :- ::lib.schema.ref/ref
   columns                              :- [:sequential ::lib.schema.metadata/column]]
  (or (not-empty (filter #(and (clojure.core/= (:lib/desired-column-alias %) ref-name)
                               (matching-join? a-ref %))
                         columns))
      (filter #(and (clojure.core/= (:name %) ref-name)
                    (matching-join? a-ref %))
              columns)))

(mu/defn ^:private plausible-matches-for-id :- [:sequential ::lib.schema.metadata/column]
  [[_ref-kind opts ref-id :as a-ref] :- ::lib.schema.ref/ref
   columns                           :- [:sequential ::lib.schema.metadata/column]
   generous?                         :- [:maybe :boolean]]
  (or (not-empty (filter #(and (clojure.core/= (:id %) ref-id)
                               ;; TODO: If the target ref has no join-alias, AND the source is fields or card, the join
                               ;; alias on the column can be ignored. QP can set it when it shouldn't. See #33972.
                               (or (and (not (:join-alias opts))
                                        (#{:source/fields :source/card} (:lib/source %)))
                                   (matching-join? a-ref %)))
                         columns))
      (when generous?
        (not-empty (filter #(clojure.core/= (:id %) ref-id) columns)))
      []))

(defn- ambiguous-match-error [a-ref columns]
  (ex-info "Ambiguous match! Implement more logic in disambiguate-matches."
           {:ref a-ref
            :columns columns}))

(mu/defn ^:private expression-column? [column]
  (or (= (:lib/source column) :source/expressions)
      (:lib/expression-name column)))

(mu/defn ^:private disambiguate-matches-dislike-field-refs-to-expressions :- [:maybe ::lib.schema.metadata/column]
  "If a custom column is a simple wrapper for a field, that column gets `:id`, `:table_id`, etc.
  A custom column should get a ref like `[:expression {} \"expr name\"]`, not `[:field {} 17]`.
  If we got a `:field` ref, prefer matches which are not `:lib/source :source/expressions`."
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential ::lib.schema.metadata/column]]
  (or (when (= (first a-ref) :field)
        (when-let [non-exprs (not-empty (remove expression-column? columns))]
          (when-not (next non-exprs)
            (first non-exprs))))
      ;; In all other cases, this is an ambiguous match.
      #_(throw (ambiguous-match-error a-ref columns))
      #?(:cljs (js/console.warn (ambiguous-match-error a-ref columns))
         :clj  (log/warn (ambiguous-match-error a-ref columns)))))

(mu/defn ^:private disambiguate-matches-prefer-explicit :- [:maybe ::lib.schema.metadata/column]
  "Prefers table-default or explicitly joined columns over implicitly joinable ones."
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential ::lib.schema.metadata/column]]
  (if-let [no-implicit (not-empty (remove :fk-field-id columns))]
    (if-not (next no-implicit)
      (first no-implicit)
      (disambiguate-matches-dislike-field-refs-to-expressions a-ref no-implicit))
    nil))

(mu/defn ^:private disambiguate-matches-no-alias :- [:maybe ::lib.schema.metadata/column]
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential ::lib.schema.metadata/column]]
  ;; a-ref without :join-alias - if exactly one column has no :source-alias, that's the match.
  ;; ignore the source alias on columns with :source/card or :source/fields
  (if-let [no-alias (not-empty (remove #(and (column-join-alias %)
                                             (not (#{:source/card} (:lib/source %))))
                                       columns))]
    ;; At least 1 matching column with no :source-alias.
    (if-not (next no-alias)
      (first no-alias)
      ;; More than 1, keep digging.
      (disambiguate-matches-prefer-explicit a-ref no-alias))
    ;; No columns are missing :source-alias - pass them all to the next stage.
    ;; TODO: I'm not certain this one is sound, but it's necessary to make `lib.join/select-home-column` work as
    ;; written. If this case causes issues, that logic may need rewriting.
    nil))

(mu/defn ^:private disambiguate-matches :- [:maybe ::lib.schema.metadata/column]
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential ::lib.schema.metadata/column]]
  (let [{:keys [join-alias]} (lib.options/options a-ref)]
    (if join-alias
      ;; a-ref has a :join-alias, match on that. Return nil if nothing matches.
      (when-let [matches (not-empty (filter #(clojure.core/= (column-join-alias %) join-alias) columns))]
        (if-not (next matches)
          (first matches)
          (#?(:cljs js/console.warn :clj log/warn)
           "Multiple plausible matches with the same :join-alias - more disambiguation needed"
           {:ref     a-ref
            :matches matches})
          #_(throw (ex-info "Multiple plausible matches with the same :join-alias - more disambiguation needed"
                          {:ref     a-ref
                           :matches matches}))))
      (disambiguate-matches-no-alias a-ref columns))))

(def ^:private FindMatchingColumnOptions
  [:map [:generous? {:optional true} :boolean]])

(mu/defn find-matching-column :- [:maybe ::lib.schema.metadata/column]
  "Given `a-ref-or-column` and a list of `columns`, finds the column that best matches this ref or column.

  Matching is based on finding the basically plausible matches first. There is often zero or one plausible matches, and
  this can return quickly.

  If there are multiple plausible matches, they are disambiguated by the most important extra included in the `ref`.
  (`:join-alias` first, then `:temporal-unit`, etc.)

  - Integer IDs in the `ref` are matched by ID; this usually is unambiguous.
    - If there are multiple joins on one table (including possible implicit joins), check `:join-alias` next.
      - If `a-ref` has a `:join-alias`, only a column which matches it can be the match, and it should be unique.
      - If `a-ref` doesn't have a `:join-alias`, prefer the column with no `:join-alias`, and prefer already selected
        columns over implicitly joinable ones.
    - There may be broken cases where the ref has an ID but the column does not. Therefore the ID must be resolved to a
      name or `:lib/desired-column-alias` and matched that way.
      - `query` and `stage-number` are required for this case, since they're needed to resolve the correct name.
      - Columns with `:id` set are dropped to prevent them matching. (If they didn't match by `:id` above they shouldn't
        match by name due to a coincidence of column names in different tables.)
  - String IDs are checked against `:lib/desired-column-alias` first.
    - If that doesn't match any columns, `:name` is compared next.
    - The same disambiguation (by `:join-alias` etc.) is applied if there are multiple plausible matches.

  Returns the matching column, or nil if no match is found."
  ([a-ref columns]
   (find-matching-column a-ref columns {}))

  ([[ref-kind _opts ref-id :as a-ref] :- ::lib.schema.ref/ref
    columns                           :- [:sequential ::lib.schema.metadata/column]
    {:keys [generous?]}               :- FindMatchingColumnOptions]
   (case ref-kind
     ;; Aggregations are referenced by the UUID of the column being aggregated.
     :aggregation  (m/find-first #(and (clojure.core/= (:lib/source %) :source/aggregations)
                                       (clojure.core/= (:lib/source-uuid %) ref-id))
                                 columns)
     ;; Expressions are referenced by name; fields by ID or name.
     (:expression
       :field)     (let [plausible (if (string? ref-id)
                                     (plausible-matches-for-name a-ref columns)
                                     (plausible-matches-for-id   a-ref columns generous?))]
                     (case (count plausible)
                       0 nil
                       1 (first plausible)
                       (disambiguate-matches a-ref plausible)))
     (throw (ex-info "Unknown type of ref" {:ref a-ref}))))

  ([query stage-number a-ref-or-column columns]
   (find-matching-column query stage-number a-ref-or-column columns {}))

  ([query           :- [:maybe ::lib.schema/query]
    stage-number    :- :int
    a-ref-or-column :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]
    columns         :- [:sequential ::lib.schema.metadata/column]
    opts            :- FindMatchingColumnOptions]
   (let [[_ref-kind _opts ref-id :as a-ref] (if (lib.util/clause? a-ref-or-column)
                                              a-ref-or-column
                                              (lib.ref/ref a-ref-or-column))]
     (or (find-matching-column a-ref columns opts)
         ;; We failed to match by ID, so try again with the column's name. Any columns with `:id` set are dropped.
         ;; Why? Suppose there are two CREATED_AT columns in play - if one has an :id and it failed to match above, then
         ;; it certainly shouldn't match by name just because of the coincidence of column names!
       (when (and query (number? ref-id))
         (when-let [no-id-columns (not-empty (remove :id columns))]
           (when-let [resolved (if (lib.util/clause? a-ref-or-column)
                                 (resolve-field-id query stage-number ref-id)
                                 a-ref-or-column)]
             (find-matching-column (-> (assoc a-ref 2 (or (:lib/desired-column-alias resolved)
                                                          (:name resolved)))
                                       ;; make sure the :field ref has a `:base-type`, it's against the rules for a
                                       ;; nominal :field ref not to have a base-type -- this can fail schema
                                       ;; validation if it's missing in the Field ID ref we generate the nominal ref
                                       ;; from.
                                       (lib.options/update-options (partial merge {:base-type :type/*})))
                                   no-id-columns
                                   opts))))))))

(defn- ref-id-or-name [[_ref-kind _opts id-or-name]]
  id-or-name)

(mu/defn find-matching-ref :- [:maybe ::lib.schema.ref/ref]
  "Given `column` and a list of `refs`, finds the ref that best matches this column.

  Throws if there are multiple, ambiguous matches.

  Returns the matching ref, or nil if no plausible matches are found."
  [column :- ::lib.schema.metadata/column
   refs   :- [:sequential ::lib.schema.ref/ref]]
  (let [ref-tails (group-by ref-id-or-name refs)
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
   haystack     :- [:sequential ::lib.schema.metadata/column]]
  (let [by-column (into {}
                        (map-indexed (fn [index column]
                                       [column index]))
                        haystack)]
    (for [needle needles
          :let [matched (find-matching-column query stage-number needle haystack)]]
      (get by-column matched -1))))

;; TODO: Refactor this away. Handle legacy refs in `lib.js`, then call [[find-matching-column]] directly.
(mu/defn find-column-for-legacy-ref :- [:maybe ::lib.schema.metadata/column]
  "Like [[find-matching-column]], but takes a legacy MBQL reference. The name here is for consistency with other
  FE names for similar functions."
  ([query legacy-ref metadatas]
   (find-column-for-legacy-ref query -1 legacy-ref metadatas))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    legacy-ref   :- :some
    metadatas    :- [:maybe [:sequential ::lib.schema.metadata/column]]]
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
   (when (seq cols)
     (let [selected-refs          (mapv lib.ref/ref selected-columns-or-refs)
           matching-selected-cols (into #{}
                                        (map #(find-matching-column query stage-number % cols))
                                        selected-refs)]
       (mapv #(assoc % :selected? (contains? matching-selected-cols %)) cols)))))
