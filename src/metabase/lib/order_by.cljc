(ns metabase.lib.order-by
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/describe-top-level-key-method :order-by
  [query stage-number _k]
  (when-let [order-bys (not-empty (:order-by (lib.util/query-stage query stage-number)))]
    (i18n/tru "Sorted by {0}"
              (lib.util/join-strings-with-conjunction
               (i18n/tru "and")
               (for [order-by order-bys]
                 (lib.metadata.calculation/display-name query stage-number order-by))))))

(defmethod lib.metadata.calculation/display-name-method :asc
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} ascending" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :desc
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} descending" (lib.metadata.calculation/display-name query stage-number expr)))

(defmulti ^:private ->order-by-clause
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->order-by-clause :asc
  [_query _stage-number clause]
  (lib.options/ensure-uuid clause))

(defmethod ->order-by-clause :desc
  [_query _stage-number clause]
  (lib.options/ensure-uuid clause))

;;; by default, try to convert `x` to a Field clause and then order by `:asc`
(defmethod ->order-by-clause :default
  [query stage-number x]
  (let [field-clause (lib.field/field query stage-number x)]
    (lib.options/ensure-uuid [:asc field-clause])))

(defn order-by-clause
  "Create an order-by clause independently of a query, e.g. for `replace` or whatever."
  ([x]
   (fn [query stage-number]
     (order-by-clause query stage-number x)))
  ([query stage-number x]
   (->order-by-clause query stage-number x)))

(mu/defn ^:private with-direction :- ::lib.schema.order-by/order-by
  "Update the direction of an order by clause."
  [clause    :- ::lib.schema.order-by/order-by
   direction :- ::lib.schema.order-by/direction]
  (assoc (vec clause) 0 direction))

(mu/defn order-by
  "Add an MBQL order-by clause (i.e., `:asc` or `:desc`) from something that you can theoretically sort by -- maybe a
  Field, or `:field` clause, or expression of some sort, etc.

  You can teach Metabase lib how to generate order by clauses for different things by implementing the
  underlying [[->order-by-clause]] multimethod."
  ([query x]
   (order-by query -1 x nil))

  ([query x direction]
   (order-by query -1 x direction))

  ([query
    stage-number :- [:maybe :int]
    x
    direction    :- [:maybe [:enum :asc :desc]]]
   (let [stage-number (or stage-number -1)
         new-order-by (cond-> (->order-by-clause query stage-number x)
                        direction (with-direction direction))]
     (lib.util/update-query-stage query stage-number update :order-by (fn [order-bys]
                                                                        (conj (vec order-bys) new-order-by))))))

(mu/defn ^:export order-bys :- [:maybe [:sequential ::lib.schema.order-by/order-by]]
  "Get the order-by clauses in a query."
  ([query :- ::lib.schema/query]
   (order-bys query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (get (lib.util/query-stage query stage-number) :order-by))))

(defn- orderable-column? [{base-type :base_type, :as _column-metadata}]
  (some (fn [orderable-base-type]
          (isa? base-type orderable-base-type))
        lib.schema.expression/orderable-types))

(mu/defn orderable-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get column metadata for all the columns you can order by in a given `stage-number` of a `query`. Rules are as
  follows:

  1. If the stage has aggregations or breakouts, you can only order by those columns. E.g.

         SELECT id, count(*) AS count FROM core_user GROUP BY id ORDER BY count ASC;

     You can't ORDER BY something not in the SELECT, e.g. ORDER BY user.first_name would not make sense here.

  2. If the stage has no aggregations or breakouts, you can order by any visible Field:

     a. You can filter by any custom `:expressions` in this stage of the query

     b. You can filter by any Field 'exported' by the previous stage of the query, if there is one; otherwise you can
        filter by any Fields from the current `:source-table`.

     c. You can filter by any Fields exported by any explicit joins

     d. You can filter by and Fields in Tables that are implicitly joinable."
  ([query :- ::lib.schema/query]
   (orderable-columns query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (let [breakouts    (not-empty (lib.breakout/breakouts query stage-number))
         aggregations (not-empty (lib.aggregation/aggregations query stage-number))]
     (filter orderable-column?
             (if (or breakouts aggregations)
               (concat breakouts aggregations)
               (lib.stage/visible-columns query stage-number))))))
