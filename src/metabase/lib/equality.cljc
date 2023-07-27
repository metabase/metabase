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

(defn- named-refs-for-integer-refs [metadata-providerable refs]
  (keep (fn [a-ref]
          (mbql.u.match/match-one a-ref
                                  [:field opts (field-id :guard integer?)]
                                  (when-let [field-name (:name (lib.metadata/field metadata-providerable field-id))]
                                    [:field opts field-name])))
        refs))

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

(defn find-closest-matches-for-refs
  "For each `needles` (which must be a ref) find the column or ref in `haystack` that it most closely matches. This is
  meant to power things like [[metabase.lib.breakout/breakoutable-columns]] which are supposed to include
  `:breakout-position` for columns that are already present as a breakout; sometimes the column in the breakout does not
  exactly match what MLv2 would have generated. So try to figure out which column it is referring to.

  The `haystack` can be either `MetadataColumns` or refs.

  Returns a map with `haystack` values as keys (whether they be columns or refs) and the corresponding index in
  `needles` as values. If for some `needle` there is no match, that index will not appear in the map.

  If you want to check that a single ref exists in a set of columns, call [[find-closest-matching-ref]] instead.

  This first looks for each matching ref with a strict comparison, then in increasingly less-strict comparisons until it
  finds something that matches. This is mostly to work around bugs like #31482 where MLv1 generated queries with
  `:field` refs that did not include join aliases even though the Fields came from joined Tables... we still know the
  Fields are the same if they have the same IDs.

  The four-arity version can also find matches between integer Field ID references like `[:field {} 1]` and
  equivalent string column name field literal references like `[:field {} \"bird_type\"]` by resolving Field IDs using
  the `query` and `stage-number`. This is ultimately a hacky workaround for totally busted legacy queries.

  Note that this currently only works when `needles` contain integer Field IDs. Any refs in the `haystack` must have
  string literal column names. Luckily we currently don't have problems with MLv1/legacy queries accidentally using
  string `:field` literals where it shouldn't have been doing so.

  Returns a list parallel to `needles`, where each element is either nil (no match) or the index of the most closely
  matching ref in `haystack`.

  IMPORTANT!

  When trying to find the matching ref for a sequence of metadatas, prefer [[index-of-closest-matching-metadata]]
  or [[closest-matching-metadata]] instead, which are less
  broken (see [[metabase.lib.equality-test/index-of-closest-matching-metadata-test]]) and is slightly more performant,
  since it converts metadatas to refs in a lazy fashion."
  ([needles haystack]
   (loop [xforms      [;; initial xform (applied before any tests) converts any columns into refs
                       #(cond-> %
                          (and (map? %)
                               (= (:lib/type %) :metadata/column)) lib.ref/ref)
                       ;; ignore irrelevant keys from :binning options
                       #(lib.options/update-options % m/update-existing :binning dissoc :metadata-fn :lib/type)
                       ;; ignore namespaced keys
                       update-options-remove-namespaced-keys
                       ;; ignore type info
                       #(lib.options/update-options % dissoc :base-type :effective-type)
                       ;; ignore temporal-unit
                       #(lib.options/update-options % dissoc :temporal-unit)
                       ;; ignore binning
                       #(lib.options/update-options % dissoc :binning)
                       ;; ignore join alias
                       #(lib.options/update-options % dissoc :join-alias)]
          haystack-xf haystack
          ;; A map of needles left to find. Keys are indexes, values are the refs to find.
          ;; Any nil needles are dropped, but their indexes still count. This makes the 4-arity form easy to write.
          needles     (into {}
                            (comp (map-indexed vector)
                                  (filter second))
                            needles)
          results     {}]
     (if (or (empty? needles)
             (empty? xforms))
       results
       (let [xformed          (map (first xforms) haystack-xf)
             needles          (update-vals needles (first xforms))
             matches          (into {}
                                    (keep (fn [[needle-index a-ref]]
                                            (when-let [match-index (first (keep-indexed #(when (= %2 a-ref) %1) xformed))]
                                              [(nth haystack match-index) needle-index])))
                                    needles)
             finished-needles (set (vals matches))]
         ;; matches is a map in the same form as results; merge them.
         (recur (rest xforms)
                xformed
                (m/remove-keys finished-needles needles)
                (merge results matches))))))

  ([query stage-number needles haystack]
   ;; First run with the needles as given.
   (let [matches       (find-closest-matches-for-refs needles haystack)
         ;; Those that were matched are replaced with nil.
         blank-matched (reduce #(assoc %1 %2 nil) (vec needles) (vals matches))
         ;; Those that remain are converted to [:field {} "name"] refs if possible, or nil if not.
         converted     (when (and query
                                  (some some? blank-matched))
                         (for [needle blank-matched
                               :let [field-id (and needle (last needle))]]
                           (when (and needle field-id (integer? field-id))
                             (-> (resolve-field-id query stage-number field-id)
                                 (dissoc :id) ; Remove any :id to force the ref to use the field name.
                                 lib.ref/ref))))]
     (if converted
       ;; If any of the needles were not found, and were converted successfully, try to match them again.
       (merge matches (find-closest-matches-for-refs converted haystack))
       ;; If we found them all, just return the matches.
       matches))))

(defn find-closest-matching-ref
  "Given a target `a-ref` and a list `refs-or-cols` of `MetadataColumns` or refs, and finds the closest match.
  Returns the value from `refs-or-cols` which most closely corresponds to `a-ref`, or nil if nothing matches.

  See [[find-closest-matches-for-refs]] for details of how the approximate matching works. (Where
  [[find-closest-matches-for-refs]] would return `{column 0}`, this returns just `column`.)"
  ([a-ref refs-or-cols]
   (->> (find-closest-matches-for-refs [a-ref] refs-or-cols)
        keys
        first))

  ([query stage-number a-ref refs-or-cols]
   (->> (find-closest-matches-for-refs query stage-number [a-ref] refs-or-cols)
        keys
        first)))

(mu/defn index-of-closest-matching-metadata :- [:maybe ::lib.schema.common/int-greater-than-or-equal-to-zero]
  "Like [[find-closest-matching-ref]], but finds the closest match for `a-ref` from a sequence of Column `metadatas`
  rather than a sequence of refs. This allows us to do more sophisticated fuzzy matching
  than [[find-closest-matching-ref]], because column metadatas inherently have more information than they do after
  they are converted to refs.

  If a match is found, this returns the index of the matching metadata in `metadatas`. Otherwise returns `nil.` If you
  want the metadata instead, use [[closest-matching-metadata]]."
  [a-ref     :- ::lib.schema.ref/ref
   metadatas :- [:maybe [:sequential lib.metadata/ColumnMetadata]]]
  (when (seq metadatas)
    ;; create refs in a lazy fashion, e.g. if the very first metadata ends up matching we don't need to create refs
    ;; for all of the other metadatas.
    (letfn [(index-with-ref-fn [ref-fn]
              ;; store the associated index in metadata attached to the created ref.
              (let [refs (for [[i metadata] (m/indexed metadatas)]
                           (vary-meta (ref-fn metadata) assoc ::index i))]
                (when-let [matching-ref (find-closest-matching-ref a-ref refs)]
                  (::index (meta matching-ref)))))]
      (or
       ;; attempt to find a matching ref using the same logic as [[find-closest-matching-ref]] ...
       (index-with-ref-fn lib.ref/ref)
       ;; if that fails, and we're comparing a "Field ID" ref like
       ;;
       ;;    [:field {} 1]
       ;;
       ;; then try again forcing creation of Field ID refs for all of the metadatas. This way we can match
       ;; things where the FE incorrectly used a Field ID ref even tho we were expecting a nominal :field
       ;; literal ref like
       ;;
       ;;    [:field {} "my_field"]
       (when (field-id-ref? a-ref)
         ;; force creation of a Field ID ref by giving it a source that will make the ref creation code
         ;; treat this as coming from a source table. This only makes sense for metadatas that have an
         ;; associated Field `:id`, so only do it for those ones.
         (index-with-ref-fn (fn [metadata]
                              (lib.ref/ref
                               (cond-> metadata
                                 (:id metadata) (assoc :lib/source :source/table-defaults))))))))))

(mu/defn closest-matching-metadata :- [:maybe lib.metadata/ColumnMetadata]
  "Like [[find-closest-matching-ref]], but finds the closest match for `a-ref` from a sequence of Column `metadatas`
  rather than a sequence of refs. See [[index-of-closet-matching-metadata]] for more info."
  [a-ref     :- ::lib.schema.ref/ref
   metadatas :- [:maybe [:sequential lib.metadata/ColumnMetadata]]]
  (when-let [i (index-of-closest-matching-metadata a-ref metadatas)]
    (nth metadatas i)))

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
  with [[index-of-closest-matching-metadata]].

  Example usage:

    ;; example (simplified) implementation of [[metabase.lib.field/fieldable-columns]]
    ;;
    ;; return (visibile-columns query), but if any of those appear in `:fields`, mark then `:selected?`
    (mark-selected-columns (visible-columns query) (:fields stage))"
  ([cols selected-columns-or-refs]
   (mark-selected-columns nil cols selected-columns-or-refs))

  ([metadata-providerable cols selected-columns-or-refs]
   (when (seq cols)
     (let [selected-refs          (mapv lib.ref/ref selected-columns-or-refs)
           matching-selected-cols (closest-matches-in-metadata metadata-providerable selected-refs cols)]
       (mapv #(assoc % :selected? (contains? matching-selected-cols %)) cols)))))
