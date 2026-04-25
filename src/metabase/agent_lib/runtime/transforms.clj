(ns metabase.agent-lib.runtime.transforms
  "Query-transform bindings for structured runtime evaluation."
  (:require
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]))

(set! *warn-on-reflection* true)

(def ^:private order-wrapper-direction-key
  :order-direction)

(def ^:private order-wrapper-value-key
  :order-value)

(defn order-wrapper?
  "True when `x` wraps an orderable together with its direction."
  [x]
  (and (map? x)
       (contains? x order-wrapper-direction-key)
       (contains? x order-wrapper-value-key)))

(defn asc-orderable
  "Wrap an orderable with ascending sort direction."
  [orderable]
  {order-wrapper-direction-key :asc
   order-wrapper-value-key     orderable})

(defn desc-orderable
  "Wrap an orderable with descending sort direction."
  [orderable]
  {order-wrapper-direction-key :desc
   order-wrapper-value-key     orderable})

(defn- freshen-orderable-ref
  "Freshen ref uuids so repeated orderables do not alias the same clause instance."
  [resolved-orderable]
  (if (vector? resolved-orderable)
    (lib.util/fresh-uuids resolved-orderable)
    resolved-orderable))

(defn apply-breakout
  "Apply a breakout, materializing expression refs when needed."
  [query breakoutable]
  (if (and (lib.util/clause? breakoutable)
           (not (lib.util/ref-clause? breakoutable)))
    (let [[query' expr-ref] (mbql/ensure-query-expression-ref query breakoutable "breakout")]
      (lib/breakout query' expr-ref))
    (lib/breakout query breakoutable)))

(defn apply-filter
  "Apply a filter clause to a query."
  [query clause]
  (lib/filter query clause))

(defn apply-with-fields
  "Apply `with-fields`, expanding raw fields into breakouts on aggregated queries."
  [query selections]
  (let [selections'      (mapv #(mbql/resolve-aggregation-selection query %) selections)
        field-selection? mbql/field-selection?
        raw-fields       (filterv field-selection? selections')
        other-selections (filterv (complement field-selection?) selections')]
    (if (and (seq (lib/aggregations query))
             (seq raw-fields))
      (let [query' (reduce lib/breakout query raw-fields)]
        (if (seq other-selections)
          (lib/with-fields query' other-selections)
          query'))
      (lib/with-fields query selections'))))

(defn apply-order-by
  "Apply `order-by`, resolving query-relative orderables first."
  ([query orderable]
   (if (order-wrapper? orderable)
     (let [[query' resolved] (mbql/resolve-orderable query (order-wrapper-value-key orderable))]
       (lib/order-by query'
                     (freshen-orderable-ref resolved)
                     (order-wrapper-direction-key orderable)))
     (let [[query' resolved] (mbql/resolve-orderable query orderable)]
       (lib/order-by query' (freshen-orderable-ref resolved)))))
  ([query a b]
   (if (#{:asc :desc} a)
     (let [[query' resolved] (mbql/resolve-orderable query b)]
       (lib/order-by query' (freshen-orderable-ref resolved) a))
     (let [[query' resolved] (mbql/resolve-orderable query a)]
       (lib/order-by query' (freshen-orderable-ref resolved) b)))))

(defn query-transform-bindings
  "Return query-transform bindings for the structured runtime."
  []
  {'asc         asc-orderable
   'desc        desc-orderable
   'breakout    apply-breakout
   'filter      apply-filter
   'with-fields apply-with-fields
   'order-by    apply-order-by})
