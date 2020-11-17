(ns metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing
  "SQL places restrictions when using a `GROUP BY` clause (MBQL `:breakout`) in combination with an `ORDER BY`
  clause (MBQL `:order-by`) -- columns that appear in the `ORDER BY` must appear in the `GROUP BY`. When we apply
  datetime or binning bucketing in a breakout, for example `cast(x AS DATE)` (MBQL `:datetime-field` clause), we need
  to apply the same bucketing to instances of that Field in the `order-by` clause. In other words:

  Bad:

    SELECT count(*)
    FROM table
    GROUP BY CAST(x AS date)
    ORDER BY x ASC

  (MBQL)

     {:source-table 1
      :breakout     [[:datetime-field [:field-id 1] :day]]
      :order-by     [[:asc [:field-id 1]]]}

  Good:

    SELECT count(*)
    FROM table
    GROUP BY CAST(x AS date)
    ORDER BY CAST(x AS date) ASC

  (MBQL)

    {:source-table 1
     :breakout     [[:datetime-field [:field-id 1] :day]]
     :order-by     [[:asc [:datetime-field [:field-id 1] :day]]]}

  The frontend, on the rare occasion it generates a query that explicitly specifies an `order-by` clause, usually will
  generate one that directly corresponds to the bad example above. This middleware finds these cases and rewrites the
  query to look like the good example."
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [schema.core :as s]))

(s/defn ^:private reconcile-bucketing :- mbql.s/Query
  [{{breakouts :breakout, order-bys :order-by} :query, :as query}]
  ;; Look for bucketed fields in the `breakout` clause and build a map of unbucketed reference -> bucketed reference,
  ;; like:
  ;;
  ;;    {[:field-id 1] [:datetime-field [:field-id 1] :day]}
  ;;
  ;; In causes where a Field is broken out more than once, prefer the bucketing used by the first breakout; accomplish
  ;; this by reversing the sequence of matches below, meaning the first match will get merged into the map last,
  ;; overwriting later matches
  (let [unbucketed-ref->bucketed-ref (into {} (reverse (mbql.u/match breakouts
                                                         [:datetime-field field _]     [field &match]
                                                         [:binning-strategy field & _] [field &match])))]
    ;; rewrite order-by clauses as needed...
    (-> (mbql.u/replace-in query [:query :order-by]
          ;; if order by is already bucketed, nothing to do
          [:datetime-field _ _]   &match
          [:binning-strategy & _] &match

          ;; if we run into a field-id that wasn't matched by the last pattern, see if there's an unbucketed reference
          ;; -> bucketed reference from earlier
          #{:field-id :fk-> :field-literal}
          (if-let [bucketed-reference (unbucketed-ref->bucketed-ref &match)]
            ;; if there is, replace it with the bucketed reference
            bucketed-reference
            ;; if there's not, again nothing to do.
            &match))
        ;; now remove any duplicate order-by clauses we may have introduced, as those are illegal in MBQL 2000
        (update-in [:query :order-by] (comp vec distinct)))))

(defn- reconcile-bucketing-if-needed
  "Check if there's a chance we need to rewrite anything. If not, return query as is."
  [{{breakouts :breakout, order-bys :order-by} :query, :as query}]
  (if (or
       ;; if there's no breakouts bucketed by a datetime-field or binning-strategy...
       (not (mbql.u/match breakouts #{:datetime-field :binning-strategy}))
       ;; or if there's no order-bys that are *not* bucketed...
       (not (mbql.u/match order-bys
              #{:datetime-field :binning-strategy} nil
              #{:field-id :fk-> :field-literal}    &match)))
    ;; return query as is
    query
    ;; otherwise, time to bucket
    (reconcile-bucketing query)))

(defn reconcile-breakout-and-order-by-bucketing
  "Replace any unwrapped Field clauses (`:field-id`, `:field-literal`, or `:fk->`) in the `order-by` clause with
  corresponding wrapped clauses (`:datetime-field` or `:binning-strategy`) used for the same Field in the `breakout`
  clause.

   {:query {:breakout [[:datetime-field [:field-id 1] :day]]
            :order-by [[:asc [:field-id 1]]]}
   ->
   {:query {:breakout [[:datetime-field [:field-id 1] :day]]
            :order-by [[:datetime-field [:asc [:field-id 1]] :day]]}"
  [qp]
  (fn [query rff context]
    (qp (reconcile-bucketing-if-needed query) rff context)))
