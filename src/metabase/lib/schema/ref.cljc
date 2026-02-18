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
     ;;
     ;; For implicitly joinable columns, the ID of the FK field used to perform the implicit join.
     ;; E.g. if the query is against `ORDERS` and the field ref is for `PRODUCTS.CATEGORY`, then `:source-field`
     ;; is the ID of `ORDERS.PRODUCT_ID` (which has `:fk-target-field-id` pointing to `PRODUCTS.ID`).
     ;;
     ;; Corresponds to `:fk-field-id` in column metadata.
     ;;
     ;; Should only be specified in the stage where the implicit join is to be performed; subsequent stages
     ;; should omit this and use field name refs instead.
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
     ;; The column alias of the FK field used for an implicit join, when it differs from the field's raw name.
     ;; This can happen when querying a card or model whose columns have aliases that don't match the underlying
     ;; field names. Needed so the implicit join condition references the correct column.
     ;;
     ;; Corresponds to `:fk-field-name` in column metadata. Omitted when it matches the raw field name.
     ;;
     ;; Together with `:source-field` and `:source-field-join-alias`, these three form a composite key that
     ;; uniquely identifies an implicit join.
     ;;
     ;; TODO (Cam 2026-01-13): field resolution is not using `:source-field-name` for disambiguation, which
     ;; seems like a bug. The same applies for `:source-field-join-alias`.
     [:source-field-name {:optional true} ::common/non-blank-string]
     ;;
     ;; The explicit join alias of the FK source column used for an implicit join. Disambiguates when the same
     ;; FK field (same ID, same column alias) is brought in by multiple explicit joins, or by the base table
     ;; and one or more explicit joins.
     ;;
     ;; For example, if ORDERS has two explicit joins "Orders_A" and "Orders_B" both joining the orders table,
     ;; both bring in `PRODUCT_ID` with the same field ID and name. `:source-field-join-alias` = "Orders_A"
     ;; or "Orders_B" identifies which copy to use for the implicit join. `nil` means the base table's copy.
     ;;
     ;; Corresponds to `:fk-join-alias` in column metadata.
     ;;
     ;; Together with `:source-field` and `:source-field-name`, these three form a composite key that uniquely
     ;; identifies an implicit join.
     [:source-field-join-alias {:optional true} ::common/non-blank-string]
     ;;
     ;; Records the temporal unit applied to this field in a previous stage. Propagated from `:temporal-unit` onto
     ;; column metadata during `returned-columns`, so it is only visible in subsequent stages. Used to pick the
     ;; default temporal unit for already-bucketed columns: when present, the default becomes `:inherited` instead
     ;; of a type-based unit like `:month`, preventing accidental double-bucketing in the UI.
     [:inherited-temporal-unit {:optional true} [:ref ::temporal-bucketing/unit]]
     ;;
     ;; Legacy key. Records the temporal unit that was originally on a field ref before it was changed or removed.
     ;; Produced by older queries and the `reconcile-breakout-and-order-by-bucketing` QP middleware. Used as a
     ;; fallback in `nest-breakouts` to determine column granularity when `:temporal-unit` is nil or `:default`.
     ;; Not produced by MLv2 code; new queries will not contain this key.
     [:original-temporal-unit {:optional true} [:ref ::temporal-bucketing/unit]]]]
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

(mbql-clause/define-tuple-mbql-clause :measure :- ::expression/type.unknown
  #_measure-id [:schema [:ref ::id/measure]])

(lib.hierarchy/derive :measure ::ref)

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
