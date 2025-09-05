(ns metabase.lib.equality
  "Logic for determining whether two pMBQL queries are equal."
  (:refer-clojure :exclude [=])
  (:require
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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

;; for debugging purposes the implementation of [[=]] for two columns return the "reason" things are not equal so we
;; can log this; [[=]] is basically just (not <reason>)

(defn- columns-not-equal-by-fn-when-non-nil-in-both
  [f col-1 col-2]
  (let [v1 (f col-1)
        v2 (f col-2)]
    (when (and v1 v2 (not= v1 v2))
      f)))

(defn- columns-not-equal-by-fn
  [f col-1 col-2]
  (when (not= (f col-1) (f col-2))
    f))

(defn- ignore-default-temporal-bucket [bucket]
  (when-not (clojure.core/= bucket :default)
    bucket))

(defn- columns-not-equal-reason
  "Returns a keyword representing the reason why two columns fail an [[=]] check (for debugging purposes)."
  [col-1 col-2]
  (or
    ;; two column metadatas with different IDs are NEVER equal.
    (columns-not-equal-by-fn-when-non-nil-in-both :id col-1 col-2)
    ;; from the same source.
    (columns-not-equal-by-fn-when-non-nil-in-both :lib/source col-1 col-2)
    ;; same join alias
    (columns-not-equal-by-fn :metabase.lib.join/join-alias col-1 col-2)
    ;; same FK Field (for implicitly joined columns)
    (columns-not-equal-by-fn-when-non-nil-in-both :fk-field-id col-1 col-2)
    (columns-not-equal-by-fn :fk-join-alias col-1 col-2)
    ;; TODO (Cam 9/4/25) -- not super clear that this ought to be a reason for columns to be considered different since
    ;; `:fk-field-name` doesn't really seem to be super important... but this check seems to be needed, otherwise when
    ;; a there are multiple remappings from Col A => Col B (e.g. in a self-join) we'll potentially accidentally match
    ;; the wrong one. Maybe we can figure out a better way to make sure that doesn't happen.
    (columns-not-equal-by-fn-when-non-nil-in-both :fk-field-name col-1 col-2)
    ;;
    ;; columns that don't have the same binning or temporal bucketing are never the same.
    ;;
    ;; same binning
    (columns-not-equal-by-fn :metabase.lib.field/binning col-1 col-2)
    ;; same bucketing
    (when (columns-not-equal-by-fn (comp ignore-default-temporal-bucket lib.temporal-bucket/raw-temporal-bucket) col-1 col-2)
      'temporal-bucket)
    ;; check `:inherited-temporal-unit` as well if both columns have it.
    (when (columns-not-equal-by-fn-when-non-nil-in-both (comp ignore-default-temporal-bucket :inherited-temporal-unit) col-1 col-2)
      :inherited-temporal-unit)
    ;; finally make sure they have the same `:lib/source-column-alias` (if both columns have it) or `:name` (if for
    ;; some reason they do not)
    (let [k (m/find-first (fn [k]
                            (and (k col-1)
                                 (k col-2)))
                          [:lib/source-column-alias :name])]
      (assert k "No key common to both columns")
      (columns-not-equal-by-fn k col-1 col-2))))

(defmethod = :metadata/column
  [col-1 col-2]
  (let [not-equal-reason (columns-not-equal-reason col-1 col-2)]
    (if not-equal-reason
      (log/debugf "Columns are not equal. Reason: %s" (pr-str not-equal-reason))
      (log/debug "Columns are equal."))
    (not not-equal-reason)))

(mr/def ::find-matching-column.options
  [:map
   {:closed true}
   [:find-matching-column/ignore-binning-and-bucketing? {:optional true, :default false} [:maybe :any]]
   ;; TODO (Cam 9/4/25) -- this is sort of a hack, the only reason we really need it is that field resolution trips up
   ;; and guesses the source for a ref sometimes, especially inside join conditions as we're building the join (i.e.,
   ;; before we add appropriate join aliases). We don't want that to be a reason that we mark selected columns
   ;; incorrectly. If field resolution never messed up, or if we came up with a better way of resolving columns in
   ;; join conditions, we wouldn't need this key.
   ;;
   ;; PLEASE don't use this key outside of this namespace. That's why it starts with `-`. If you do I will hunt you
   ;; down. -- Cam
   [:find-matching-column/-HACK-ignore-source? {:optional true, :default false} [:maybe :any]]])

(defn- find-matching-column-by-uuid
  "Implementation for [[find-matching-column]]; attempt to do a quick and dirty match using
  `:lib/uuid`/`:lib/source-uuid`.

  This should never return a match that wouldn't be returned by [[find-matching-column-by-=]], and is thus here mainly
  as a performance optimization: theoretically it should be possible to remove this entirely and still have things
  work normally.

  TODO (Cam 9/4/25) -- I considered removing this and taking the performance hit to simplify the code but it seems
  like doing so actually causes test failures, which can only mean this does return matches that otherwise wouldn't
  have been considered [[=]]. We should spend some time investigating why this is happening and fix whatever is going
  on."
  [ref-or-col columns]
  (when-let [ref-or-col-uuid (if (map? ref-or-col)
                               (:lib/source-uuid ref-or-col)
                               (lib.options/uuid ref-or-col))]
    ;; a `:field` ref should never match an `:expression` definition, etc. This can happen if an expression definition
    ;; is a `:field` ref like
    ;;
    ;;    [:field {:lib/expression-name "abc"} 123]
    ;;
    ;; in this case `returned-columns` will return metadata for expression `abc` when what you REALLY wanted was the
    ;; previous-stage metadata for Field 123. See for
    ;; example [[metabase.lib.remove-replace-test/remove-clause-adjust-ref-names-test]].
    ;;
    ;; We only need to filter these columns out here and not for [[find-matching-column-by-=]] because the `=` code is
    ;; smart enough not to get tripped up by these anyway.
    (let [columns (filter (case (lib.dispatch/dispatch-value ref-or-col)
                            :field           #(not (#{:source/expressions :source/aggregations} (:lib/source %)))
                            :expression      #(= (:lib/source %) :source/expressions)
                            :aggregation     #(= (:lib/source %) :source/aggregations)
                            :metadata/column identity)
                          columns)
          matches (filter (fn [a-col]
                            (clojure.core/= (:lib/source-uuid a-col) ref-or-col-uuid))
                          columns)]
      ;; if there are multiple potential matches then fall back to matching with `=` -- this can happen if we
      ;; concatenate returned columns and visible columns together --
      ;; see [[metabase.lib.equality-test/find-matching-column-prefer-exact-matches-test]] for more info
      (when (clojure.core/= (count matches) 1)
        (let [col (first matches)]
          (when-let [original-id (if (map? ref-or-col)
                                   (:id ref-or-col)
                                   (when (pos-int? (last ref-or-col))
                                     (last ref-or-col)))]
            (when-let [resolved-id (:id col)]
              (assert (= resolved-id original-id)
                      (lib.util/format "Resolved column has different ID (%d) than original column (%d), despite having the same UUID (%s)!"
                                       resolved-id original-id (pr-str ref-or-col-uuid)))))
          col)))))

(defn- find-matching-column-update-col-for-options [col options]
  (cond-> col
    (:find-matching-column/ignore-binning-and-bucketing? options) (-> (lib.binning/with-binning nil)
                                                                      (lib.temporal-bucket/with-temporal-bucket nil))
    (:find-matching-column/-HACK-ignore-source? options) (dissoc :lib/source)))

(defn- find-matching-column-by-=
  [query stage-number ref-or-col columns options]
  (when-let [col (if (map? ref-or-col)
                   ref-or-col
                   (u/prog1 (lib.metadata.calculation/metadata query stage-number ref-or-col)
                     (log/debugf "Resolved ref\n%s\nto\n%s" (u/cprint-to-str ref-or-col) (u/cprint-to-str <>))))]
    (let [col (find-matching-column-update-col-for-options col options)]
      (m/find-first #(u/prog1 (= (find-matching-column-update-col-for-options % options) col)
                       (log/debugf "Matches?\n%s\n=> %s" (u/cprint-to-str %) (pr-str <>)))
                    columns))))

(mu/defn find-matching-column :- [:maybe ::lib.schema.metadata/column]
  "Find the column in `columns` that matches a `ref-or-col`. Matches with `:lib/uuid`/`:lib/source-uuid` if there is
  exactly one match, otherwise resolves the ref if needed and returns the first match with [[=]].

  For less-strict matching you can pass `{:find-matching-column/ignore-binning-and-bucketing? true}`."
  ([query stage-number ref-or-col columns]
   (find-matching-column query stage-number ref-or-col columns nil))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    ref-or-col   :- [:or
                     ::lib.schema.metadata/column
                     ::lib.schema.ref/ref]
    columns      :- [:sequential ::lib.schema.metadata/column]
    options      :- [:maybe ::find-matching-column.options]]
   (or (find-matching-column-by-uuid ref-or-col columns)
       (find-matching-column-by-= query stage-number ref-or-col columns options))))

(defn- ref-id-or-name [[_ref-kind _opts id-or-name]]
  id-or-name)

(mu/defn find-matching-ref :- [:maybe ::lib.schema.ref/ref]
  "Given `column` and a list of `refs`, finds the ref that best matches this column.

  Throws if there are multiple, ambiguous matches.

  Returns the matching ref, or nil if no plausible matches are found.

  `column` AND `refs` MUST BOTH BE RELATIVE TO THE SAME STAGE FOR THIS TO WORK CORRECTLY!!!!!!"
  [column :- ::lib.schema.metadata/column
   refs   :- [:sequential ::lib.schema.ref/ref]]
  (let [matches   (or (when-let [source-uuid (:lib/source-uuid column)]
                        (some (fn [a-ref]
                                (when (= (lib.options/uuid a-ref) source-uuid)
                                  [a-ref]))
                              refs))
                      ;; same stage match, use SOURCE COLUMN ALIAS!!!! IF YOU ARE NOT CLEAR ON WHY, TALK TO YOUR BOY
                      ;; CAM!!!!
                      (let [col-join-alias      (lib.join.util/current-join-alias column)
                            col-source-field    (:fk-field-id column)
                            source-column-alias ((some-fn :lib/source-column-alias :name) column)]
                        (filter (fn [a-ref]
                                  (and (clojure.core/= (:join-alias (lib.options/options a-ref)) col-join-alias)
                                       (clojure.core/= (:source-field (lib.options/options a-ref)) col-source-field)
                                       (some #(clojure.core/= (ref-id-or-name a-ref) %)
                                             [(:id column) source-column-alias])))
                                refs))
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
  ([query legacy-ref cols]
   (find-column-for-legacy-ref query -1 legacy-ref cols))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    legacy-ref   :- :some
    cols         :- [:maybe [:sequential ::lib.schema.metadata/column]]]
   (find-matching-column query stage-number (lib.convert/legacy-ref->pMBQL query stage-number legacy-ref) cols)))

(mu/defn mark-selected-columns
  "Mark `columns` as `:selected?` if they appear in `selected-columns-or-refs`. Uses fuzzy matching with
  [[find-matching-column]].

  Example usage:

    ;; example (simplified) implementation of [[metabase.lib.field/fieldable-columns]]
    ;;
    ;; return (visibile-columns query), but if any of those appear in `:fields`, mark then `:selected?`
    (mark-selected-columns (visible-columns query) (:fields stage))"
  [query                    :- ::lib.schema/query
   stage-number             :- :int
   cols                     :- [:sequential ::lib.schema.metadata/column]
   selected-columns-or-refs :- [:or
                                [:sequential ::lib.schema.metadata/column]
                                [:sequential ::lib.schema.ref/ref]]]
  (when (> (count selected-columns-or-refs) (count cols))
    (log/errorf "[mark-selected-columns] There are more selected columns (%d) than there are total columns (%d)"
                (count selected-columns-or-refs) (count cols)))
  (when (seq cols)
    (let [matching-selected-cols (into #{}
                                       (keep (fn [selected-col-or-ref]
                                               ;; ignore temporal bucketing for marking columns as selected
                                               ;; purposes (#32920)
                                               (or (find-matching-column query stage-number selected-col-or-ref cols
                                                                         {:find-matching-column/ignore-binning-and-bucketing? true
                                                                          :find-matching-column/-HACK-ignore-source?          true})
                                                   (do
                                                     (log/warnf "[mark-selected-columns] failed to find match for %s" (pr-str selected-col-or-ref))
                                                     nil))))
                                       selected-columns-or-refs)]
      (when-not (clojure.core/= (count selected-columns-or-refs) (count matching-selected-cols))
        (log/warnf "[mark-selected-columns] %d refs are selected, but we found %d matches"
                   (count selected-columns-or-refs)
                   (count matching-selected-cols)))
      (mapv #(assoc % :selected? (contains? matching-selected-cols %)) cols))))

(mu/defn matching-column-sets? :- :boolean
  "Returns true if the provided `refs` is the same set as the provided `columns`.

  Order is ignored. Only returns true if each of the `refs` matches a column, and each of the `columns` is matched by
  exactly 1 of the `refs`. (A bijection, in math terms.)"
  [query        :- ::lib.schema/query
   stage-number :- :int
   refs         :- [:sequential ::lib.schema.ref/ref]
   columns      :- [:sequential ::lib.schema.metadata/column]]
  ;; The lists match iff:
  ;; - Each ref matches a column; AND
  ;; - Each column was matched by exactly one ref
  ;; So we return true if nil is not a key in the matching, AND all vals in the matching have length 1,
  ;; AND the matching has as many elements as `columns` (usually the list of columns returned by default).
  (and (clojure.core/= (count refs) (count columns))
       (let [matching (group-by #(find-matching-column query stage-number % columns) refs)]
         (and (not (contains? matching nil))
              (clojure.core/= (count matching) (count columns))
              (every? #(clojure.core/= (count %) 1) (vals matching))))))
