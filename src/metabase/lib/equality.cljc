(ns metabase.lib.equality
  "Logic for determining whether two pMBQL queries are equal."
  (:refer-clojure :exclude [= every? some mapv empty? not-empty get-in #?(:clj for)])
  (:require
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.card :as lib.card]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every? some mapv empty? not-empty get-in #?(:clj for)]]))

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

#?(:clj
   (defn- faster-not=
     "Like `clojure.core/not=`, but optimized for Long objects on JVM. When both arguments are Longs, uses `.equals`
directly instead of going through `Numbers.equal`, which avoids extra type checking that is unnecessary when types
are known to be the same."
     [a b]
     (not (if (and (instance? Long a) (instance? Long b))
            (.equals ^Long a b)
            (clojure.core/= a b)))))

(defn- columns-not-equal-by-fn-when-non-nil-in-both
  [f col-1 col-2]
  (let [v1 (f col-1)
        v2 (f col-2)]
    (when (and v1 v2 (#?(:clj faster-not= :cljs not=) v1 v2))
      f)))

(defn- columns-not-equal-by-fn
  [f col-1 col-2]
  (when (#?(:clj faster-not= :cljs not=) (f col-1) (f col-2))
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

(mu/defn- resolve-field-id-in-source-card :- ::lib.schema.metadata/column
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

(mu/defn- column-join-alias :- [:maybe :string]
  [column :- ::lib.schema.metadata/column]
  ;; TODO (Cam 6/19/25) -- seems busted to be using joins that happened at ANY LEVEL previously for equality purposes
  ;; so lightly but removing this breaks stuff. We should just remove this and do smarter matching like we do
  ;; in [[plausible-matches-for-name-with-join-alias]] below.
  ((some-fn :metabase.lib.join/join-alias :lib/original-join-alias :source-alias) column))

(mu/defn- matching-join? :- :boolean
  [[_ref-kind {:keys [join-alias source-field source-field-name
                      source-field-join-alias]} _ref-id] :- ::lib.schema.ref/ref
   column                                                :- ::lib.schema.metadata/column]
  (if source-field
    (and (clojure.core/= source-field (:fk-field-id column))
         ;; `source-field-name` is not available on old refs
         (or (nil? source-field-name) (clojure.core/= source-field-name (:fk-field-name column)))
         (clojure.core/= source-field-join-alias (:fk-join-alias column)))
    (clojure.core/= (column-join-alias column) join-alias)))

(defn- plausible-matches-for-name-no-join-alias [ref-name columns]
  (some (fn [k]
          (not-empty
           (filter #(= (k %) ref-name)
                   columns)))
        [;; We SHOULD be using the source column alias (aka the desired column alias from the previous stage) so try
         ;; that first.
         :lib/source-column-alias
         ;; if that fails, maybe we're using the old QP results metadata deduplicated names, so look for matches with
         ;; that.
         :lib/deduplicated-name
         ;; if that fails, fall back to looking for matches using the old broken ambiguous `:name` key.
         :name]))

(defn- plausible-matches-for-name-with-join-alias [join-alias ref-name columns]
  ;; first, look for matches for a join that came from the current stage -- `:metabase.lib.join/join-alias`; if we
  ;; don't see any columns a match for that key, assume the join was from a previous stage and look at
  ;; `:lib/original-join-alias` instead.
  (letfn [(plausible-matches [columns]
            (or
             ;; ideally, the ref would be using the column name exported by the join... assuming `columns` is the set
             ;; of columns exported by the stage as a whole, then the `source-column-alias` for these columns is the
             ;; name exported by their source (i.e., this join)
             (not-empty
              (filter #(= (:lib/source-column-alias %) ref-name)
                      columns))
             ;; If we fail to find a match using source column alias, then look for a match using a deduplicated name
             ;; RELATIVE to the join, not the WHOLE STAGE!!!! We need to recalculate these. Consider this case. If we
             ;; have a stage that returns these three columns:
             ;;
             ;;    | :id | :name | :join-alias | :deduplicated-name |
             ;;    |-----+-------+-------------+--------------------|
             ;;    |   1 |    ID |             |                 ID |
             ;;    |   2 |    ID |           J |               ID_2 |
             ;;    |   3 |    ID |           J |               ID_3 |
             ;;
             ;; which column does
             ;;
             ;;    [:field {:join-alias "J"}, "ID_2"]
             ;;
             ;; refer to? The correct answer (IMO) is column 3, because `ID_2` and `ID_3` are 'exported' as as `ID`
             ;; and `ID_2` by the join itself!
             (let [deduplicated-name->col (zipmap (map :lib/deduplicated-name (lib.field.util/add-deduplicated-names columns))
                                                  columns)]
               (not-empty
                (keep (fn [[deduplicated-name col]]
                        (when (clojure.core/= deduplicated-name ref-name)
                          col))
                      deduplicated-name->col)))
             ;; if we failed to find a deduplicated name match then try to match on original name
             (not-empty
              (filter #(= (:lib/original-name %) ref-name)
                      columns))
             ;; and if THAT still fails fall back to broken `:name`.
             (not-empty
              (filter #(= (:name %) ref-name)
                      columns))))]
    (when-let [columns-from-join (some (fn [k]
                                         (not-empty (filter #(= (k %) join-alias) columns)))
                                       [:metabase.lib.join/join-alias
                                        :lib/original-join-alias
                                        ;; use the `:source-alias` key which was traditionally set by QP result
                                        ;; metadata sometimes if neither one of the other keys had match(es)
                                        :source-alias])]
      (plausible-matches columns-from-join))))

(mu/defn- plausible-matches-for-name :- [:maybe [:sequential ::lib.schema.metadata/column]]
  [[_ref-kind opts ref-name :as _a-ref] :- ::lib.schema.ref/ref
   columns                              :- [:sequential ::lib.schema.metadata/column]]
  (or (when-let [join-alias (:join-alias opts)]
        (or (plausible-matches-for-name-with-join-alias join-alias ref-name columns)
            ;; if there's no match for a join then fall back to trying to match by ignoring the join alias.
            (do (log/warnf "Failed to find match for column %s with join alias %s, looking for match without join alias..."
                           (pr-str ref-name)
                           (pr-str join-alias))
                nil)))
      (plausible-matches-for-name-no-join-alias ref-name columns)))

(mu/defn- plausible-matches-for-id :- [:sequential ::lib.schema.metadata/column]
  [[_ref-kind opts ref-id :as a-ref] :- ::lib.schema.ref/ref
   columns                           :- [:sequential ::lib.schema.metadata/column]
   generous?                         :- [:maybe :boolean]]
  (or (not-empty (filter #(and (clojure.core/= (:id %) ref-id)
                               ;; TODO: If the target ref has no join-alias, AND the source is card, the join alias on
                               ;; the column can be ignored. QP can set it when it shouldn't. See #33972.
                               (or (and (not (:join-alias opts))
                                        (= (:lib/source %) :source/card))
                                   (matching-join? a-ref %)))
                         columns))
      (when generous?
        (not-empty (filter #(clojure.core/= (:id %) ref-id) columns)))
      []))

(defn- ambiguous-match-error [a-ref columns]
  (ex-info "Ambiguous match! Implement more logic in disambiguate-matches."
           {:ref a-ref
            :columns columns}))

(mu/defn- expression-column? [column]
  (or (clojure.core/= (:lib/source column) :source/expressions)
      (:lib/expression-name column)))

(mu/defn- disambiguate-matches-dislike-field-refs-to-expressions :- [:maybe ::lib.schema.metadata/column]
  "If a custom column is a simple wrapper for a field, that column gets `:id`, `:table_id`, etc.
  A custom column should get a ref like `[:expression {} \"expr name\"]`, not `[:field {} 17]`.
  If we got a `:field` ref, prefer matches which are not `:lib/source :source/expressions`."
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential ::lib.schema.metadata/column]]
  (or (when (clojure.core/= (first a-ref) :field)
        (when-let [non-exprs (not-empty (remove expression-column? columns))]
          (when-not (next non-exprs)
            (first non-exprs))))
      ;; In all other cases, this is an ambiguous match.
      #_(throw (ambiguous-match-error a-ref columns))
      #?(:cljs (js/console.warn (ambiguous-match-error a-ref columns))
         :clj  (log/warn (ambiguous-match-error a-ref columns)))))

(defn- matching-col-with-fn [columns col-fn]
  (let [matching-columns (filter col-fn columns)]
    (when (clojure.core/= (count matching-columns) 1)
      (first matching-columns))))

(mu/defn- disambiguate-matches-find-match-with-same-binning :- [:maybe ::lib.schema.metadata/column]
  "If there are multiple matching columns and `a-ref` has a binning value, check if only one column has that same
  binning."
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential {:min 2} ::lib.schema.metadata/column]]
  (or (let [binning (lib.binning/binning a-ref)]
        (matching-col-with-fn columns #(lib.binning/binning= (lib.binning/binning %) binning)))
      (when-let [original-binning (:lib/original-binning (lib.options/options a-ref))]
        (matching-col-with-fn columns #(lib.binning/binning= (:lib/original-binning %) original-binning)))
      (disambiguate-matches-dislike-field-refs-to-expressions a-ref columns)))

(mu/defn- disambiguate-matches-find-match-with-same-temporal-bucket :- [:maybe ::lib.schema.metadata/column]
  "If there are multiple matching columns and `a-ref` has a temporal bucket, check if only one column has that same
  unit."
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential {:min 2} ::lib.schema.metadata/column]]
  (or (let [bucket (lib.temporal-bucket/raw-temporal-bucket a-ref)]
        (matching-col-with-fn columns #(clojure.core/= (lib.temporal-bucket/raw-temporal-bucket %) bucket)))
      (when-let [inherited-bucket (:inherited-temporal-unit (lib.options/options a-ref))]
        (matching-col-with-fn columns #(clojure.core/= (:inherited-temporal-unit %) inherited-bucket)))
      (disambiguate-matches-find-match-with-same-binning a-ref columns)))

(mu/defn- disambiguate-matches-prefer-explicit :- [:maybe ::lib.schema.metadata/column]
  "Prefers table-default or explicitly joined columns over implicitly joinable ones."
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential ::lib.schema.metadata/column]]
  (if-let [no-implicit (not-empty (remove :fk-field-id columns))]
    (if-not (next no-implicit)
      (first no-implicit)
      (disambiguate-matches-find-match-with-same-temporal-bucket a-ref no-implicit))
    nil))

(mu/defn- disambiguate-matches-ignoring-join-alias :- [:maybe ::lib.schema.metadata/column]
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential ::lib.schema.metadata/column]]
  ;; a-ref without :join-alias - if exactly one column has no :source-alias, that's the match.
  ;; ignore the source alias on columns with :source/card
  (if-let [no-alias (not-empty (remove #(and (column-join-alias %)
                                             (not= (:lib/source %) :source/card))
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

(mu/defn- disambiguate-matches :- [:maybe ::lib.schema.metadata/column]
  [a-ref   :- ::lib.schema.ref/ref
   columns :- [:sequential ::lib.schema.metadata/column]]
  (let [{:keys [join-alias]} (lib.options/options a-ref)]
    (or
     ;; try to find matches with the same join alias (which might be `nil` for both).
     ;;
     ;; TODO (Cam 6/26/25) -- we should first try this using just the `:metabase.lib.join/join-alias` (join alias from
     ;; this stage) and only then fall back to using `:lib/original-alias` and what not
     (when-let [matches (not-empty (filter #(clojure.core/= (column-join-alias %) join-alias) columns))]
       (if-not (next matches)
         (first matches)
         ;; if there wasn't exactly 1 match then log a warning only if we had a join alias in the first place. Then
         ;; try again ignoring join alias.
         (do
           (when join-alias
             (#?(:cljs js/console.warn :clj log/warn)
              "Multiple plausible matches with the same :join-alias - more disambiguation needed"
              {:ref     a-ref
               :matches matches}))
           nil)))
     (disambiguate-matches-ignoring-join-alias a-ref columns))))

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
     :aggregation (m/find-first #(and (clojure.core/= (:lib/source %) :source/aggregations)
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
   ;; if we're matching against column metadata then we can try to use [[=]] to match instead of trying to do
   ;; ref-based matching.
   (or
    (when (clojure.core/= (:lib/type a-ref-or-column) :metadata/column)
      (let [col     a-ref-or-column
            matches (filter #(= % col) columns)]
        ;; only return the match found this way if it is unambiguous.
        ;;
        ;; TODO (Cam 8/19/25) -- we should update this to disambiguate matches for these instead of falling back to
        ;; the ref-based-resolution code, since finding matches between column metadata is more accurate
        (when (clojure.core/= (count matches) 1)
          (first matches))))
    (let [[ref-kind ref-opts ref-id :as a-ref] (if (lib.util/clause? a-ref-or-column)
                                                 a-ref-or-column
                                                 (lib.ref/ref a-ref-or-column))]
      (or (find-matching-column a-ref columns opts)
          ;; Aggregations are matched by `:source-uuid` but if we're comparing old columns to new refs or vice versa
          ;; the random UUIDs won't match up. This falls back to the `:lib/source-name` option on aggregation refs, if
          ;; present.
          (when (and (clojure.core/= ref-kind :aggregation)
                     (:lib/source-name ref-opts))
            (m/find-first #(and (clojure.core/= (:lib/source %) :source/aggregations)
                                (clojure.core/= (:name %) (:lib/source-name ref-opts)))
                          columns))
          ;; We failed to match by ID, so try again with the column's name. Any columns with `:id` set are dropped.
          ;; Why? Suppose there are two CREATED_AT columns in play - if one has an :id and it failed to match above, then
          ;; it certainly shouldn't match by name just because of the coincidence of column names!
          (when (and query (number? ref-id))
            (when-let [no-id-columns (not-empty (remove :id columns))]
              (when-let [resolved (if (lib.util/clause? a-ref-or-column)
                                    (resolve-field-id-in-source-card query stage-number ref-id)
                                    a-ref-or-column)]
                (find-matching-column (-> (assoc a-ref 2 (or (:lib/desired-column-alias resolved)
                                                             (:name resolved)))
                                          ;; make sure the :field ref has a `:base-type`, it's against the rules for a
                                          ;; nominal :field ref not to have a base-type -- this can fail schema
                                          ;; validation if it's missing in the Field ID ref we generate the nominal ref
                                          ;; from.
                                          (lib.options/update-options (partial merge {:base-type :type/*})))
                                      no-id-columns
                                      opts)))))))))

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
   (when (> (count selected-columns-or-refs) (count cols))
     (log/errorf "[mark-selected-columns] There are more selected columns (%d) than there are total columns (%d)"
                 (count selected-columns-or-refs) (count cols)))
   (when (seq cols)
     (let [matching-selected-cols (into #{}
                                        (keep (fn [selected-col-or-ref]
                                                (or (find-matching-column query stage-number selected-col-or-ref cols)
                                                    (do
                                                      (log/warnf "[mark-selected-columns] failed to find match for %s" (pr-str selected-col-or-ref))
                                                      nil))))
                                        selected-columns-or-refs)]
       (when-not (clojure.core/= (count selected-columns-or-refs) (count matching-selected-cols))
         (log/warnf "[mark-selected-columns] %d refs are selected, but we found %d matches"
                    (count selected-columns-or-refs)
                    (count matching-selected-cols)))
       (mapv #(assoc % :selected? (contains? matching-selected-cols %)) cols)))))

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
