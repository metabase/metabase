(ns metabase.lib.equality
  "Logic for determining whether two pMBQL queries are equal."
  (:refer-clojure :exclude [=])
  (:require
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
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

(defn ^:deprecated ref=
  "Are two refs `x` and `y` equal?

  DEPRECATED: use [[find-closest-matching-ref]] instead. This does not work if things like `:base-type` are missing or
  differ slightly, or handle `:binning` correctly, let alone when things are broken more significantly. If we improve
  type calculation it shouldn't break existing queries... right?"
  [x y]
  (or (= x y)
      (= (lib.util/with-default-effective-type x)
         (lib.util/with-default-effective-type y))))

(defn- update-options-remove-namespaced-keys [a-ref]
  (lib.options/update-options a-ref (fn [options]
                                      (into {} (remove (fn [[k _v]] (qualified-keyword? k))) options))))

(defn find-closest-matching-ref
  "Find the ref that most closely matches `a-ref` from a sequence of `refs`. This is meant to power things
  like [[metabase.lib.breakout/breakoutable-columns]] which are supposed to include `:breakout-position` for columns
  that are already present as a breakout; sometimes the column in the breakout does not exactly match what MLv2 would
  have generated. So try to figure out which column it is referring to.

  This first looks for a matching ref with a strict comparison, than in increasingly less-strict comparisons until it
  finds something that matches. This is mostly to work around buts like #31482 where MLv1 generated queries with
  `:field` refs that did not include join aliases even tho the Fields came from joined Tables... we still know the
  Fields are the same if they have the same IDs.

  The three-arity version can also find matches between integer Field ID references like `[:field {} 1]` and
  equivalent string column name field literal references like `[:field {} \"bird_type\"]` by resolving Field IDs using
  a `metadata-providerable` (something that can be treated as a metadata provider, e.g. a `query` with a
  MetadataProvider associated with it). This is the ultimately hacky workaround for totally busted legacy queries.
  Note that this currently only works when `a-ref` is the one with the integer Field ID and `refs` have string literal
  column names; it does not work the other way around. Luckily we currently don't have problems with MLv1/legacy
  queries accidentally using string :field literals where it shouldn't have been doing so."
  ([a-ref refs]
   (loop [xform identity, more-xforms [ ;; ignore irrelevant keys from :binning options
                                       #(lib.options/update-options % m/update-existing :binning dissoc :metadata-fn :lib/type)
                                       ;; ignore namespaced keys
                                       update-options-remove-namespaced-keys
                                       ;; ignore type info
                                       #(lib.options/update-options % dissoc :base-type :effective-type)
                                       ;; ignore join alias
                                       #(lib.options/update-options % dissoc :join-alias)]]
     (or (let [a-ref (xform a-ref)]
           (m/find-first #(= (xform %) a-ref)
                         refs))
         (when (seq more-xforms)
           (recur (comp xform (first more-xforms)) (rest more-xforms))))))

  ([metadata-providerable a-ref refs]
   (or (find-closest-matching-ref a-ref refs)
       (mbql.u.match/match-one a-ref
         [:field opts (field-id :guard integer?)]
         (when-let [field-name (:name (lib.metadata/field metadata-providerable field-id))]
           (find-closest-matching-ref [:field opts field-name] refs))))))
