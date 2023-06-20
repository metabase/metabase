(ns metabase.lib.order-by
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.u.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(lib.hierarchy/derive :asc  ::order-by-clause)
(lib.hierarchy/derive :desc ::order-by-clause)

(defmethod lib.metadata.calculation/describe-top-level-key-method :order-by
  [query stage-number _k]
  (when-let [order-bys (not-empty (:order-by (lib.util/query-stage query stage-number)))]
    (i18n/tru "Sorted by {0}"
              (lib.util/join-strings-with-conjunction
               (i18n/tru "and")
               (for [order-by order-bys]
                 (lib.metadata.calculation/display-name query stage-number order-by :long))))))

(defmethod lib.metadata.calculation/display-name-method ::order-by-clause
  [query stage-number [tag _opts expr] style]
  (let [expr-display-name (lib.metadata.calculation/display-name query stage-number expr style)]
    (case tag
      :asc  (i18n/tru "{0} ascending"  expr-display-name)
      :desc (i18n/tru "{0} descending" expr-display-name))))

(defmethod lib.metadata.calculation/display-info-method ::order-by-clause
  [query stage-number [tag _opts expr]]
  (assoc (lib.metadata.calculation/display-info query stage-number expr)
         :direction tag))

(defmulti ^:private order-by-clause-method
  {:arglists '([orderable])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defmethod order-by-clause-method ::order-by-clause
  [clause]
  (lib.options/ensure-uuid clause))

;;; by default, try to convert `x` to a ref and then order by `:asc`
(defmethod order-by-clause-method :default
  [x]
  (when (nil? x)
    (throw (ex-info (i18n/tru "Can''t order by nil") {})))
  (lib.options/ensure-uuid [:asc (lib.ref/ref x)]))

(mu/defn ^:private with-direction :- ::lib.schema.order-by/order-by
  "Update the direction of an order by clause."
  [clause    :- ::lib.schema.order-by/order-by
   direction :- ::lib.schema.order-by/direction]
  (assoc (vec clause) 0 direction))

(mu/defn order-by-clause
  "Create an order-by clause independently of a query, e.g. for `replace` or whatever."
  ([orderable]
   (order-by-clause orderable :asc))

  ([orderable :- some?
    direction :- [:maybe [:enum :asc :desc]]]
   (-> (order-by-clause-method orderable)
       (with-direction (or direction :asc)))))

(mu/defn order-by
  "Add an MBQL order-by clause (i.e., `:asc` or `:desc`) from something that you can theoretically sort by -- maybe a
  Field, or `:field` clause, or expression of some sort, etc.

  You can teach Metabase lib how to generate order by clauses for different things by implementing the
  underlying [[order-by-clause-method]] multimethod."
  ([query orderable]
   (order-by query -1 orderable nil))

  ([query orderable direction]
   (order-by query -1 orderable direction))

  ([query
    stage-number :- [:maybe :int]
    orderable    :- some?
    direction    :- [:maybe [:enum :asc :desc]]]
   (let [stage-number (or stage-number -1)
         new-order-by (cond-> (order-by-clause-method orderable)
                        direction (with-direction direction))]
     (lib.util/update-query-stage query stage-number update :order-by (fn [order-bys]
                                                                        (conj (vec order-bys) new-order-by))))))

(mu/defn order-bys :- [:maybe [:sequential ::lib.schema.order-by/order-by]]
  "Get the order-by clauses in a query."
  ([query :- ::lib.schema/query]
   (order-bys query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (get (lib.util/query-stage query stage-number) :order-by))))

(defn- orderable-column? [{:keys [base-type], :as _column-metadata}]
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
   (let [indexed-order-bys (map-indexed (fn [pos [_tag _opts expr]]
                                          [pos expr])
                                        (order-bys query stage-number))
         order-by-pos
         (fn [x]
           (some (fn [[pos existing-order-by]]
                   (let [a-ref (lib.ref/ref x)]
                     (when (or (lib.equality/= a-ref existing-order-by)
                               (lib.equality/= a-ref (lib.util/with-default-effective-type existing-order-by)))
                       pos)))
                 indexed-order-bys))

         breakouts          (not-empty (lib.breakout/breakouts-metadata query stage-number))
         aggregations       (not-empty (lib.aggregation/aggregations-metadata query stage-number))
         columns            (if (or breakouts aggregations)
                              (concat breakouts aggregations)
                              (let [stage (lib.util/query-stage query stage-number)]
                                (lib.metadata.calculation/visible-columns query stage-number stage)))]
     (some->> (not-empty columns)
              (into [] (comp (filter orderable-column?)
                             (map (fn [col]
                                    (let [pos (order-by-pos col)]
                                      (cond-> col
                                        pos (assoc :order-by-position pos)))))))))))

(def ^:private opposite-direction
  {:asc :desc
   :desc :asc})

(mu/defn change-direction :- ::lib.schema/query
  "Flip the direction of `current-order-by` in `query`."
  ([query :- ::lib.schema/query
    current-order-by :- ::lib.schema.order-by/order-by]
   (let [lib-uuid (lib.util/clause-uuid current-order-by)]
     (mbql.u.match/replace query
       [direction (_ :guard #(= (:lib/uuid %) lib-uuid)) _]
       (assoc &match 0 (opposite-direction direction))))))
