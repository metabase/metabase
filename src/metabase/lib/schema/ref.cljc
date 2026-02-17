(ns metabase.lib.schema.ref
  "Malli schema for a Field, aggregation, or expression reference (etc.)"
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.binning :as binning]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types.core]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types.core/keep-me)

(defn valid-temporal-unit-for-base-type?
  "Whether `temporal-unit` (e.g. `:day`) is valid for the given `base-type` (e.g. `:type/Date`). If either is `nil` this
  will return truthy. Accepts either map of `field-options` or `base-type` and `temporal-unit` passed separately."
  ([{:keys [base-type temporal-unit] :as _field-options}]
   (valid-temporal-unit-for-base-type? base-type temporal-unit))

  ([base-type temporal-unit]
   (if-let [units (when (and temporal-unit
                             (not= temporal-unit :default)
                             base-type)
                    (condp #(isa? %2 %1) base-type
                      :type/Date     temporal-bucketing/date-bucketing-units
                      :type/Time     temporal-bucketing/time-bucketing-units
                      :type/DateTime temporal-bucketing/datetime-bucketing-units
                      nil))]
     (contains? units temporal-unit)
     true)))

(defn normalize-field-options-map
  "Normalize a `:field` ref options map."
  [m]
  (when (map? m)
    (let [m (common/normalize-options-map m)]
      ;; remove nil values
      (reduce-kv
       (fn [m k v]
         (cond-> m
           (nil? v)
           (dissoc k)))
       m
       m))))

(mr/def ::field.options
  [:and
   [:merge
    {:encode/serialize (fn [opts]
                         (m/filter-keys (fn [k]
                                          (or (simple-keyword? k)
                                              (= (namespace k) "lib")))
                                        opts))
     :decode/normalize normalize-field-options-map}
    ::common/options
    [:map
     ;;
     ;; `:join-alias` is used to refer to a FieldOrExpression from a different Table/nested query that you are
     ;; EXPLICITLY JOINING against.
     [:join-alias                                 {:optional true} [:ref ::lib.schema.join/alias]]
     ;;
     ;; `:temporal-unit` is used to specify DATE BUCKETING for a FieldOrExpression that represents a moment in time of some sort.
     ;;
     ;; There is no requirement that all `:type/Temporal` derived FieldOrExpressions specify a `:temporal-unit`, but
     ;; for legacy reasons `:field` clauses that refer to `:type/DateTime` FieldOrExpressions will be automatically
     ;; \"bucketed\" in the `:breakout` and `:filter` clauses, but nowhere else. Auto-bucketing only applies to
     ;; `:filter` clauses when values for comparison are `yyyy-MM-dd` date strings. See the `auto-bucket-datetimes`
     ;; middleware for more details. `:field` clauses elsewhere will not be automatically bucketed, so drivers still
     ;; need to make sure they do any special datetime handling for plain `:field` clauses when their
     ;; FieldOrExpression derives from `:type/DateTime`.
     [:temporal-unit                              {:optional true} [:ref ::temporal-bucketing/unit]]
     ;;
     ;; Using binning requires the driver to support the `:binning` feature.
     [:binning                                    {:optional true} [:ref ::binning/binning]]
     [:lib/original-binning                       {:optional true} [:ref ::binning/binning]]
     [:metabase.lib.field/original-effective-type {:optional true} [:ref ::common/base-type]]
     [:metabase.lib.field/original-temporal-unit  {:optional true} [:ref ::temporal-bucketing/unit]]
     ;;
     ;; for implicitly joinable columns, this is the ID of the FK in `:source-table` (or the previous stage) used to
     ;; perform the implicit join. E.g. if the query is against `ORDERS` and the field ref is for `CATEGORIES.NAME`
     ;; then `:source-field` should be `ORDERS.CATEGORY_ID`. This column should have `:fk-target-field-id` that points
     ;; to `CATEGORIES.ID`. This (ideally) should only be specified in the stage of the query the implicit join is to
     ;; be done; subsequent stages should omit this and use field name refs instead e.g. `CATEGORIES__via__CATEGORY_ID`.
     ;;
     ;; You REALLY shouldn't be specifying this for a field name ref, since it makes resolution 10x harder. There's
     ;; a 99.9% chance that using a field name ref with `:source-field` is a bad idea and broken, I even
     ;; considered banning it at the schema level, but decided to let it be for now since we should still be
     ;; able to resolve it.
     ;;
     ;; If both `:source-field` and `:join-alias` are supplied, `:join-alias` should be used to perform the join;
     ;; `:source-field` should be for information purposes only.
     [:source-field {:optional true} [:ref ::id/field]]
     ;;
     ;; The name or source column alias of the field used for an implicit join.
     ;;
     ;; TODO (Cam 2026-01-13): Not really clear which on we're using in practice -- we need to investigate this
     ;; further and write down clear notes about when and where this is set.
     ;;
     ;; This is needed in some cases to disambiguate fields when there are multiple joins that all bring in multiple
     ;; copies of `:source-field` -- `:source-field-name` will be used to disambiguate which particular copy we want
     ;; to use.
     ;;
     ;; TODO (Cam 2026-01-13): It doesn't seem like [[metabase.lib.field.resolution]] is using `:source-field-name`
     ;; for disambiguation purposes which seems like a clear bug... we should add some tests around this and make sure
     ;; it can pick the correct field when `:source-field-name` is present. (The same applies for
     ;; `:source-field-join-alias`.)
     ;;
     ;; TODO (Cam 2026-01-13): I think `:source-field-join-alias` is much better suited for purposes of disambiguating
     ;; two copies of a column from two different joins, and it's much easier to resolve than `:source-field-name` and
     ;; clearer
     ;;
     [:source-field-name {:optional true} ::common/non-blank-string]
     ;;
     ;; The join alias of the source field used for an implicit join.
     ;;
     ;; TODO (Cam 2026-01-13): This apparently serves a similar purpose to `:source-field-name`, but it's not clear
     ;; that anyone actually sets this... it's also ignored by [[metabase.lib.field.resolution]], and seems like it
     ;; could trigger duplicate ref issues similar to #67808. Let's either remove this as a key entirely or commit to
     ;; actually documenting and supporting it, and making sure `:field` deduplication works correctly with two copies
     ;; of the same ref where one has this and one does not.
     ;;
     [:source-field-join-alias {:optional true} ::common/non-blank-string]
     ;;
     ;; Inherited temporal unit captures the temporal unit, that has been set on a ref, for next stages. It is attached
     ;; _to a column_, which is created from this ref by means of `returned-columns`, ie. is visible [inherited temporal
     ;; unit] in next stages only. This information is used eg. to help pick a default _temporal unit_ for columns that
     ;; are bucketed -- if a column contains `:inherited-temporal-unit`, it was bucketed already in previous stages,
     ;; so nil default picked to avoid another round of bucketing. Shall user bucket the column again, they have to
     ;; select the bucketing explicitly in QB.
     [:inherited-temporal-unit {:optional true} [:ref ::temporal-bucketing/unit]]]]
   (common/disallowed-keys
    {:strategy ":binning keys like :strategy are not allowed at the top level of :field options."})
   ;; If `:base-type` is specified, the `:temporal-unit` must make sense, e.g. no bucketing by `:year`for a
   ;; `:type/Time` column.
   [:fn
    {:error/message    "Invalid :temporal-unit for the specified :base-type."
     :decode/normalize (fn [m]
                         (cond-> m
                           (not (valid-temporal-unit-for-base-type? m)) (dissoc :temporal-unit)))}
    #'valid-temporal-unit-for-base-type?]])

(mr/def ::field.literal.options
  [:merge
   ::field.options
   [:map
    [:base-type [:ref ::common/base-type]]]])

;;; `:field` clause
(mr/def ::field.literal
  [:tuple
   [:= :field]
   ::field.literal.options
   :string])

(mr/def ::field.id
  [:tuple
   [:= :field]
   ::field.options ; TODO -- we should make `:base-type` required here too
   ::id/field])

(mbql-clause/define-mbql-clause :field
  [:and
   {:decode/normalize (fn [x]
                        (when (sequential? x)
                          (cond
                            (= (count x) 2)
                            [:field {} (second x)]

                            (and (= (count x) 3)
                                 ((some-fn pos-int? string?) (second x))
                                 ((some-fn map? nil?) (last x)))
                            [:field (or (last x) {}) (second x)]

                            :else
                            x)))}
   [:tuple
    [:= {:decode/normalize common/normalize-keyword} :field]
    [:ref ::field.options]
    [:or ::id/field :string]]
   [:multi {:dispatch      (fn [clause]
                             ;; apparently it still tries to dispatch when humanizing errors even if the `:tuple`
                             ;; schema above failed, so we need to check that this is actually a tuple here again.
                             (when (sequential? clause)
                               (let [[_field _opts id-or-name] clause]
                                 (lib.dispatch/dispatch-value id-or-name))))
            ;; without this it gives us dumb messages like "Invalid dispatch value" if the dispatch function above
            ;; doesn't return something that matches.
            :error/message "Invalid :field clause ID or name: must be a string or integer"}
    [:dispatch-type/integer ::field.id]
    [:dispatch-type/string ::field.literal]]])

(lib.hierarchy/derive :field ::ref)

(defmethod expression/type-of-method :field
  [[_tag opts _id-or-name]]
  (or ((some-fn :effective-type :base-type) opts)
      ::expression/type.unknown))

(defn normalize-expression-options
  "Normalize an expression options map."
  [m]
  (when (map? m)
    (normalize-field-options-map m)))

(mr/def ::expression.options
  [:merge
   {:decode/normalize normalize-expression-options}
   ::common/options
   [:map
    [:temporal-unit {:optional true} [:ref ::temporal-bucketing/unit]]]])

(mbql-clause/define-mbql-clause :expression
  [:tuple
   [:= {:decode/normalize common/normalize-keyword} :expression]
   [:ref ::expression.options]
   [:ref #_expression-name ::common/non-blank-string]])

(defmethod expression/type-of-method :expression
  [[_tag opts _expression-name]]
  (or ((some-fn :effective-type :base-type) opts)
      ::expression/type.unknown))

(lib.hierarchy/derive :expression ::ref)

(defn normalize-aggregation-ref-options
  "Normalize an `:aggregation` ref options map."
  [m]
  (when (map? m)
    (normalize-field-options-map m)))

(mr/def ::aggregation-options
  [:merge
   {:decode/normalize normalize-aggregation-ref-options}
   ::common/options
   [:map
    [:name            {:optional true} ::common/non-blank-string]
    [:display-name    {:optional true} ::common/non-blank-string]
    [:lib/source-name {:optional true} ::common/non-blank-string]]])

(mbql-clause/define-mbql-clause :aggregation
  [:tuple
   [:= {:decode/normalize common/normalize-keyword} :aggregation]
   ::aggregation-options
   :string])

(defmethod expression/type-of-method :aggregation
  [[_tag opts _index]]
  (or ((some-fn :effective-type :base-type) opts)
      ::expression/type.unknown))

(lib.hierarchy/derive :aggregation ::ref)

(mbql-clause/define-tuple-mbql-clause :segment :- :type/Boolean
  #_segment-id [:schema [:ref ::id/segment]])

(lib.hierarchy/derive :segment ::ref)

(mbql-clause/define-tuple-mbql-clause :metric :- ::expression/type.unknown
  #_metric-id [:schema [:ref ::id/card]])

(lib.hierarchy/derive :metric ::ref)

(mr/def ::ref
  [:and
   ::mbql-clause/clause
   [:fn
    {:error/fn (fn [_ _]
                 (str "Valid reference, must be one of these clauses: "
                      (str/join ", " (sort (descendants @lib.hierarchy/hierarchy ::ref)))))}
    (fn [[tag :as _clause]]
      (lib.hierarchy/isa? tag ::ref))]])
