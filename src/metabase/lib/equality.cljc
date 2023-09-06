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
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.u.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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
  (lib.options/update-options a-ref (fn [options]
                                      (into {} (remove (fn [[k _v]] (qualified-keyword? k))) options))))

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

;;; ------------------------------------------------ Squinting -------------------------------------------------------
;;; When trying to match columns and refs, there are lots of details that might not match up.
;;; For example, we might have a column with a breakout by `:temporal-unit` in the query, but then try to match a naive
;;; `[:field {} 12]` against it. That should succeed, but we want to match including the `:temporal-unit` if given.
;;;
;;; To implement this, we define a set of "squinting" strategies. I call this "squinting" because we're blurring the
;;; details more and more until two things look the same.
;;;
;;; Squinting at a value returns a lazy sequence of successively more generic versions of the value. Note that many of
;;; the versions might be the same as their predecessor (eg. if the value has no `:temporal-unit`); that's okay.
;;; Since we want to squint the "same amount" at many values, trying to find a match, it's important that each sequence
;;; has the same number of steps.
(defn- ->ref [ref-or-column]
  (cond-> ref-or-column
    (and (map? ref-or-column)
         (= (:lib/type ref-or-column) :metadata/column)) lib.ref/ref))

(def ^:private squints
  [;; ignore irrelevant keys from :binning options
   #(lib.options/update-options % m/update-existing :binning dissoc :metadata-fn :lib/type)
   ;; ignore namespaced keys
   update-options-remove-namespaced-keys
   ;; ignore type info
   #(lib.options/update-options % dissoc :base-type :effective-type)
   ;; ignore temporal-unit
   #(lib.options/update-options % dissoc :temporal-unit)
   ;; ignore binning
   #(lib.options/update-options % dissoc :binning)])

(defn- squint-by [xforms ref-or-column]
  (when ref-or-column
    (reductions (fn [r f] (f r)) (->ref ref-or-column) xforms)))

(defn- squint-keep-join [ref-or-column]
  (squint-by squints ref-or-column))

(defn- squint-drop-join [ref-or-column]
  ;; This tries the full chain of squints with any :join-alias, and if that doesn't match, then we start from the
  ;; original ref, drop the :join-alias, and then run the full chain of squints again.
  (when ref-or-column
    (let [a-ref (->ref ref-or-column)]
      (concat (squint-keep-join a-ref)
              (squint-keep-join (lib.options/update-options a-ref dissoc :join-alias))))))

;;; ------------------------------------------------ Matching --------------------------------------------------------
(defn- match-needle-to-haystack
  ([squinty-needle squinty-haystack] (match-needle-to-haystack squinty-needle squinty-haystack 0))
  ([squinty-needle squinty-haystack depth]
   (when (seq squinty-needle)
     (let [needle  (first squinty-needle)
           matches (keep-indexed (fn [i squinty-hay]
                                   (when (= needle (first squinty-hay))
                                     i))
                                 squinty-haystack)]
       (if (empty? matches)
         (recur (rest squinty-needle) (map rest squinty-haystack) (inc depth))
         (do
           (when (> (count matches) 1)
             (log/warn (i18n/tru "Ambiguous match for {0}: got {1}" (pr-str needle) (pr-str matches))))
           [(first matches) depth]))))))

(defn- lowest-depth
  "Given a list of [haystack-index [needle-index depth]] pairs, find the one with the lowest depth.
  If there's more than one pair with that depth, throw an error.

  Returns the `needle-index` with the lowest depth."
  [pairs]
  (let [pairs     (map second pairs) ; Drop the unnecessary [haystack-index ...] outer layer.
        min-depth (reduce (fn [m [_needle-index depth]] (min m depth)) 100 pairs)
        at-depth  (filter #(= (second %) min-depth) pairs)]
    (if (= (count at-depth) 1)
      (ffirst at-depth)
      ;; TODO: This should be thrown as an exception rather than a warning, but currently there are some ambiguous
      ;; columns returned in certain cases of nested queries. Eg. Orders joined to Products, then nest that query.
      ;; Then for each column in Products, `visible-columns` returns two: one with `:source/card`, and one with
      ;; `:source/implicitly-joinable`. For regular queries we use the IDs to de-dupe them, but the columns from the
      ;; nested query have no `:id` or `:table-id`.
      (do
        (log/warn  (i18n/tru "Ambiguous match: needles at {0} matched a single haystack value"
                             (pr-str (map first at-depth))))
        ;; Arbitrarily returning the earlier of the two matches.
        (ffirst at-depth)))))

(defn find-closest-matches-for-refs
  "For each of `needles` (which must be a ref) find the column or ref in `haystack` that it most closely matches. This
  is meant to power things like [[metabase.lib.breakout/breakoutable-columns]] which are supposed to include
  `:breakout-position` for columns that are already present as a breakout; sometimes the column in the breakout does not
  exactly match what MLv2 would have generated. So try to figure out which column it is referring to. The fuzzy matching
  is powered by the \"squinting\" logic defined in this namespace.

  As a special case, if the input ref has an ID, and 1 or more `haystacks` have the same ID, those are immediately
  matched.

  The `haystack` can be either `MetadataColumns` or refs.

  Returns a map with `haystack` values as keys (whether they be columns or refs) and the corresponding index in
  `needles` as values. If for some `needle` there is no match, that index will not appear in the map.

  If there are multiple matches for a `needle` at the same level of \"squinting\", an error is thrown.
  TODO: Perhaps there are legitimate cases where this will happen? If so, we should add logic to disambiguate matches.
  (For example, prefer any other `:source/*` over `:source/implicitly-joinable`, if the `needle` has no `:join-alias`.)

  `opts` can be used to influence the level of flexibility.
    :keep-join? if truthy, the join information will not be ignored

  If you want to check that a single ref exists in a set of columns, call [[find-closest-matching-ref]] instead.

  The four- and five-arity versions can also find matches between integer Field ID references like `[:field {} 1]` and
  equivalent string column name field literal references like `[:field {} \"bird_type\"]` by resolving Field IDs using
  the `query` and `stage-number`. This is ultimately a hacky workaround for totally busted legacy queries.

  Note that this currently only works when `needles` contain integer Field IDs. Any refs in the `haystack` must have
  string literal column names. Luckily we currently don't have problems with MLv1/legacy queries accidentally using
  string `:field` literals where it shouldn't have been doing so.

  Returns a list parallel to `needles`, where each element is either nil (no match) or the index of the most closely
  matching ref in `haystack`.

  IMPORTANT!

  When trying to find the matching ref for a sequence of metadatas, prefer [[closest-matching-metadata]] instead, which
  is less broken (see [[metabase.lib.equality-test/closest-matching-metadata-test]]) and slightly more performant, since
  it converts metadatas to refs in a lazy fashion."
  ([needles haystack]
   (find-closest-matches-for-refs needles haystack {}))
  ([needles haystack opts]
   (let [squint           (if (:keep-join? opts) squint-keep-join squint-drop-join)
         ;; There's an important performance trade-off here - the lazy transformations for each value in the haystack
         ;; are kept in memory and reused for each needle, so we avoid repeatedly transforming the haystack.
         ;; This costs memory while this function is running, but saves a lot of time.
         squinty-needles  (map squint needles)
         squinty-haystack (map squint haystack)
         matches          (keep-indexed (fn [index squinty-needle]
                                          (when-let [[haystack-index depth] (match-needle-to-haystack squinty-needle squinty-haystack)]
                                            [haystack-index [index depth]]))
                                        squinty-needles)
         match-groups     (-> (group-by first matches)
                              (update-vals lowest-depth))]
     ;; A successful match! match-groups is {haystack-index needle-index}, so map the keys to be haystack values.
     (update-keys match-groups #(nth haystack %))))

  ([query stage-number needles haystack]
   (find-closest-matches-for-refs query stage-number needles haystack {}))
  ([query stage-number needles haystack opts]
   ;; First run with the needles as given.
   (let [matches       (find-closest-matches-for-refs needles haystack opts)
         ;; Those that were matched are replaced with nil.
         blank-matched (reduce #(assoc %1 %2 nil) (vec needles) (vals matches))
         ;; Those that remain are converted to [:field {} "name"] refs if possible, or nil if not.
         converted     (when (and query
                                  (some some? blank-matched))
                         (for [needle blank-matched
                               :let [field-id (last needle)]]
                           (when (integer? field-id)
                             (-> (resolve-field-id query stage-number field-id)
                                 (dissoc :id ; Remove any :id to force the ref to use the field name.
                                         :lib/desired-column-alias) ; Hack: resolving by name doesn't work if this is present
                                 lib.ref/ref))))]
     (if converted
       ;; If any of the needles were not found, and were converted successfully, try to match them again.
       (merge matches (find-closest-matches-for-refs converted haystack opts))
       ;; If we found them all, just return the matches.
       matches))))

(defn find-closest-matching-ref
  "Given a target `a-ref` and a list `refs-or-cols` of `MetadataColumns` or refs, and finds the closest match.
  Returns the value from `refs-or-cols` which most closely corresponds to `a-ref`, or nil if nothing matches.

  See [[find-closest-matches-for-refs]] for details of how the approximate matching works. (Where
  [[find-closest-matches-for-refs]] would return `{column 0}`, this returns just `column`.)"
  ([a-ref refs-or-cols]
   (find-closest-matching-ref a-ref refs-or-cols {}))
  ([a-ref refs-or-cols opts]
   (->> (find-closest-matches-for-refs [a-ref] refs-or-cols opts)
        keys
        first))

  ([query stage-number a-ref refs-or-cols]
   (find-closest-matching-ref query stage-number a-ref refs-or-cols {}))
  ([query stage-number a-ref refs-or-cols opts]
   (->> (find-closest-matches-for-refs query stage-number [a-ref] refs-or-cols opts)
        keys
        first)))

(defn- annotate-index [xs]
  (map-indexed (fn [i x]
                 (when x
                   (vary-meta x assoc ::index i)))
               xs))

(defn- cascading-matches
  "For each of `ref-fns`, this does the following:
  - Map `(first ref-fns)` over the `haystack-metadatas`.
  - Annotate these results with metadata to map them back to the original `haystack-metadatas`.
  - Call [[find-closest-matches-for-refs]] with `needles` and this list of refs.
  - Map the results back to use the original `haystack-metadatas` as keys, rather than the refs.
  - Merge the results right-to-left, so that **earlier matches win**.
  - Remove any matched `needles` and `haystack-metadatas` from the inputs.
  - If both inputs are nonempty, continue to the next `ref-fns`, if any."
  [needles haystack-metadatas opts ref-fns]
  (let [original-needles (annotate-index needles)]
    (loop [current-needles         original-needles
           current-haystack        haystack-metadatas
           [ref-fn & more-ref-fns] ref-fns
           result                  {}]
      (cond
        (or (empty? current-needles)
            (empty? current-haystack)
            (nil? ref-fn))            result
        (nil? ref-fn)                 (recur current-needles current-haystack more-ref-fns result)
        :else
        (let [haystack-ref->col  (m/index-by ref-fn current-haystack)
              matches            (-> (find-closest-matches-for-refs current-needles (keys haystack-ref->col) opts)
                                     ;; This returns a map {haystack-ref index-in-current-needles}.
                                     ;; We want to adjust both keys and vals to
                                     ;; {haystack-metadata index-in-original-needles}
                                     (update-vals #(->> % (nth current-needles) meta ::index))
                                     (update-keys haystack-ref->col))
              matched-needles    (set (vals matches))]
          (recur (remove #(matched-needles (::index (meta %))) current-needles)
                 ;; Replace the matched haystacks with nil so they can't match again.
                 (for [metadata current-haystack]
                   (when-not (contains? matches metadata)
                     metadata))
                 more-ref-fns
                 ;; TODO: Merging in this direction gives priority to the earliest match.
                 ;; Perhaps any collision should be an error?
                 (merge matches result)))))))

(mu/defn closest-matches-in-metadata :- [:map-of
                                         lib.metadata/ColumnMetadata
                                         ::lib.schema.common/int-greater-than-or-equal-to-zero]
  "Like [[find-closest-matches-for-refs]], but finds the closest match for each element of `needles` from a haystack of
  Column `metadatas` rather than a haystack of refs. This allows us to do more sophisticated fuzzy matching than
  [[find-closest-matches-for-refs]], because column metadatas inherently have more information than they do after they
  are converted to refs.

  Returns a map `{column-metadata index-in-needles}` for each successful match. If nothing is found that matches a
  `needle`, no entry for it appears in the map.

  If you only have a single `needle` ref to look up, use [[closest-matching-metadata]]."
  ([needles haystack-metadatas]
   (closest-matches-in-metadata needles haystack-metadatas {}))

  ([needles haystack-metadatas opts]
   (when (seq haystack-metadatas)
     ;; The matching is done in two passes: first as plain refs, second by forcing ID refs.
     ;; Each of these returns a map of `{^{::index i} haystack-ref needle-index}`. Those haystack values which match
     ;; are removed between stages.
     (cascading-matches
       needles haystack-metadatas opts
       [;; The first pass attempts to match the refs using the regular [[find-closest-matches-for-refs]].
        lib.ref/ref
        ;; If that fails to match some needles, and there's at least some needles which are "Field ID" refs like
        ;;
        ;;    [:field {} 1]
        ;;
        ;; then try again, forcing creation of Field ID refs for all of the metadatas. This way we can match
        ;; things where the FE incorrectly used a Field ID ref even tho we were expecting a nominal :field
        ;; literal ref like
        ;;
        ;;    [:field {} "my_field"]
        (when (some field-id-ref? needles)
          ;; Force creation of a Field ID ref by giving it a `:lib/source` that will make the ref creation code
          ;; treat it as coming from a source table. This only makes sense for metadatas that have an associated
          ;; Field `:id`, so others are left as-is.
          (fn [metadata]
            (cond-> metadata
              (:id metadata) (assoc :lib/source :source/table-defaults)
              metadata       lib.ref/ref)))])))

  ([query stage-number needles haystack-metadatas]
   (closest-matches-in-metadata query stage-number needles haystack-metadatas {}))

  ([query                 :- [:maybe ::lib.schema/query]
    stage-number          :- :int
    needles               :- [:sequential [:maybe ::lib.schema.ref/ref]]
    haystack-metadatas    :- [:sequential lib.metadata/ColumnMetadata]
    opts                  :- [:map [:keep-join? {:optional true} :boolean]]]
   ;; This could be more efficient if the second pass were run on the un-matched subset, like cascading-matches.
   (let [basic   (closest-matches-in-metadata needles haystack-metadatas opts)
         ;; In case that fails, we need to fall back and try matching any integer IDs by name like the four-arity
         ;; version of [[find-closest-matching-ref]].
         by-name (when (and query
                            (some field-id-ref? needles))
                   (closest-matches-in-metadata
                     (for [[_field _opts field-id] needles]
                       (when (pos-int? field-id)
                         (lib.ref/ref (resolve-field-id query stage-number field-id))))
                     haystack-metadatas
                     opts))]
     ;; Prefer the more precise integer ID matches over the name-based ones.
     (merge by-name basic))))

(mu/defn closest-matching-metadata :- [:maybe lib.metadata/ColumnMetadata]
  "Like [[find-closest-matching-ref]], but finds the closest match for `a-ref` from a sequence of Column `metadatas`
  rather than a sequence of refs. See [[index-of-closet-matching-metadata]] for more info."
  ([a-ref metadatas]
   (closest-matching-metadata a-ref metadatas {}))

  ([a-ref metadatas opts]
   (closest-matching-metadata nil -1 a-ref metadatas opts))

  ([query stage-number a-ref metadatas]
   (closest-matching-metadata query stage-number a-ref metadatas {}))

  ([query                 :- [:maybe ::lib.schema/query]
    stage-number          :- :int
    a-ref                 :- ::lib.schema.ref/ref
    metadatas             :- [:sequential lib.metadata/ColumnMetadata]
    opts                  :- [:map [:keep-join? {:optional true} :boolean]]]
   (->> (closest-matches-in-metadata query stage-number [a-ref] metadatas opts)
        keys
        first)))

(mu/defn find-column-indexes-for-refs :- [:sequential :int]
  "Given a list `haystack` of columns or refs, and a list `needles` of refs to searc for, this returns a list parallel
  to `needles` with the corresponding index into the `haystack`, or -1 if not found.

  DISCOURAGED: This is intended for use only by [[metabase.lib.js/find-column-indexes-from-legacy-refs]].
  Other MLv2 code should use [[closest-matching-metadata]] if the `haystack` is columns, or
  [[find-closest-matches-for-refs]] if it's refs."
  [query        :- ::lib.schema/query
   stage-number :- :int
   needles      :- [:sequential ::lib.schema.ref/ref]
   haystack     :- [:sequential [:or lib.metadata/ColumnMetadata ::lib.schema.ref/ref]]]
  (let [;; matches is a map of haystack values to the corresponding index in needles.
        matches (find-closest-matches-for-refs query stage-number needles haystack {:keep-join? true})
        ;; We want to return a parallel list to needles, giving the index of the matching column (or -1).
        ;; First, map each column to its index (in the haystack).
        column->index (into {} (for [index (range (count haystack))]
                                 [(nth haystack index) index]))
        ;; And use that to map each match's needle-index to its column-index.
        by-index      (into {} (for [[column needle-index] matches]
                                 [needle-index (column->index column)]))]
    (->> (range (count needles))
         (map #(by-index % -1)))))

;; TODO: Refactor this away. Handle legacy refs in `lib.js`, then call [[closest-matching-metadata]] directly.
(mu/defn find-column-for-legacy-ref :- [:maybe lib.metadata/ColumnMetadata]
  "Like [[closest-matching-metadata]], but takes a legacy MBQL reference. The name here is for consistency with other
  FE names for similar functions."
  ([query legacy-ref metadatas]
   (find-column-for-legacy-ref query -1 legacy-ref metadatas))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    legacy-ref   :- some?
    metadatas    :- [:maybe [:sequential lib.metadata/ColumnMetadata]]]
   (closest-matching-metadata (lib.convert/legacy-ref->pMBQL query stage-number legacy-ref) metadatas)))

(defn mark-selected-columns
  "Mark `columns` as `:selected?` if they appear in `selected-columns-or-refs`. Uses fuzzy matching
  with [[closest-matching-metadata]].

  Example usage:

    ;; example (simplified) implementation of [[metabase.lib.field/fieldable-columns]]
    ;;
    ;; return (visibile-columns query), but if any of those appear in `:fields`, mark then `:selected?`
    (mark-selected-columns (visible-columns query) (:fields stage))"
  ([cols selected-columns-or-refs]
   (mark-selected-columns cols selected-columns-or-refs {}))

  ([cols selected-columns-or-refs opts]
   (mark-selected-columns nil -1 cols selected-columns-or-refs opts))

  ([query stage-number cols selected-columns-or-refs]
   (mark-selected-columns query stage-number cols selected-columns-or-refs {}))

  ([query stage-number cols selected-columns-or-refs opts]
   (when (seq cols)
     (let [selected-refs          (mapv lib.ref/ref selected-columns-or-refs)
           matching-selected-cols (closest-matches-in-metadata query stage-number selected-refs cols opts)]
       (mapv #(assoc % :selected? (contains? matching-selected-cols %)) cols)))))
