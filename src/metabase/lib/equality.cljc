(ns metabase.lib.equality
  "Logic for determining whether two pMBQL queries are equal."
  (:refer-clojure :exclude [=])
  (:require
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.mbql.util.match :as mbql.u.match]))

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

(defn- named-refs-for-integer-refs [metadata-providerable refs]
  (keep (fn [a-ref]
          (mbql.u.match/match-one a-ref
                                  [:field opts (field-id :guard integer?)]
                                  (when-let [field-name (:name (lib.metadata/field metadata-providerable field-id))]
                                    [:field opts field-name])))
        refs))

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

  The three-arity version can also find matches between integer Field ID references like `[:field {} 1]` and
  equivalent string column name field literal references like `[:field {} \"bird_type\"]` by resolving Field IDs using
  a `metadata-providerable` (something that can be treated as a metadata provider, e.g. a `query` with a
  MetadataProvider associated with it). This is the ultimately hacky workaround for totally busted legacy queries.

  Note that this currently only works when `needles` contain integer Field IDs. The `haystack` refs must have string
  literal column names. Luckily we currently don't have problems with MLv1/legacy queries accidentally using string
  `:field` literals where it shouldn't have been doing so."
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
                       ;; ignore binning and bucketing
                       #(lib.options/update-options % dissoc :binning :temporal-unit)
                       ;; ignore join alias
                       #(lib.options/update-options % dissoc :join-alias)]
          haystack-xf haystack
          ;; A map of needles left to find. Keys are indexes, values are the refs to find.
          ;; Any nil needles are dropped, but their indexes still count. This makes the 3-arity form easy to write.
          needles     (into {}
                            (comp (map-indexed vector)
                                  (filter second))
                            needles)
          results     nil]
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

  ([metadata-providerable needles haystack]
   ;; First run with the needles as given.
   (let [matches       (find-closest-matches-for-refs needles haystack)
         ;; Those that were matched are replaced with nil.
         blank-matched (reduce #(assoc %1 %2 nil) needles (vals matches))
         ;; Those that remain are converted to [:field {} "name"] refs if possible, or nil if not.
         converted     (when (and metadata-providerable
                                  (some some? blank-matched))
                         (for [needle blank-matched]
                           (when needle
                             (mbql.u.match/match-one needle
                               [:field opts (field-id :guard integer?)]
                               (when-let [field-name (:name (lib.metadata/field metadata-providerable field-id))]
                                 [:field opts field-name])))))]
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

  ([metadata-providerable a-ref refs-or-cols]
   (->> (find-closest-matches-for-refs metadata-providerable [a-ref] refs-or-cols)
        keys
        first)))

;; START HERE: Find all existing uses of find-closest-matches-for-refs and refactor them for the new return value.
;; Then find all uses for `find-closest-matching-ref` refactor to use `find-closest-matches-for-refs` if better.
;; *Then* write some tests to make sure it works in all the cases we wanted it to, with columns and all.

(defn mark-selected-columns
  "Mark `columns` as `:selected?` if they appear in `selected-columns-or-refs`. Uses fuzzy matching
  with [[find-closest-matching-ref]].

  Example usage:

    ;; example (simplified) implementation of [[metabase.lib.field/fieldable-columns]]
    ;;
    ;; return (visibile-columns query), but if any of those appear in `:fields`, mark then `:selected?`
    (mark-selected-columns (visibile-columns query) (:fields stage))"
  ([columns selected-columns-or-refs]
   (mark-selected-columns nil columns selected-columns-or-refs))

  ([metadata-providerable columns selected-columns-or-refs]
   (let [selected-refs          (mapv lib.ref/ref selected-columns-or-refs)
         refs                   (mapv lib.ref/ref columns)
         matching-selected-refs (into #{}
                                      (map (fn [selected-ref]
                                             (find-closest-matching-ref metadata-providerable selected-ref refs)))
                                      selected-refs)]
     (mapv (fn [col a-ref]
             (assoc col :selected? (contains? matching-selected-refs a-ref)))
           columns
           refs))))
