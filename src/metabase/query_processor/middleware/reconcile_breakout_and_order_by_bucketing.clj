(ns metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing
  "SQL places restrictions when using a `GROUP BY` clause (MBQL `:breakout`) in combination with an `ORDER BY`
  clause (MBQL `:order-by`) -- columns that appear in the `ORDER BY` must appear in the `GROUP BY`. When we apply
  datetime or binning bucketing in a breakout, for example `cast(x AS DATE)` (`:field` `:temporal-unit`), we need
  to apply the same bucketing to instances of that Field in the `order-by` clause. In other words:

  Bad:

    SELECT count(*)
    FROM table
    GROUP BY CAST(x AS date)
    ORDER BY x ASC

  (MBQL)

     {:source-table 1
      :breakout     [[:field 1 {:temporal-unit :day}]]
      :order-by     [[:asc [:field 1 nil]]]}

  Good:

    SELECT count(*)
    FROM table
    GROUP BY CAST(x AS date)
    ORDER BY CAST(x AS date) ASC

  (MBQL)

    {:source-table 1
     :breakout     [[:field 1 {:temporal-unit :day}]]
     :order-by     [[:asc [:field 1 {:temporal-unit :day}]]]}

  The frontend, on the rare occasion it generates a query that explicitly specifies an `order-by` clause, usually will
  generate one that directly corresponds to the bad example above. This middleware finds these cases and rewrites the
  query to look like the good example."
  (:refer-clojure :exclude [not-empty])
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [not-empty]]))

(defn- bucketed-breakouts [query stage-path {breakouts :breakout, :as _stage}]
  (->> breakouts
       (filter (some-fn lib/raw-temporal-bucket lib/binning))
       (map (fn [breakout]
              (let [col (lib.walk/apply-f-for-stage-at-path lib/metadata query stage-path breakout)]
                {:unbucketed-col         (-> col
                                             (lib/with-temporal-bucket nil)
                                             (lib/with-binning nil))
                 :bucket                 (lib/raw-temporal-bucket col)
                 :binning                (lib/binning col)
                 :original-temporal-unit (:original-temporal-unit (lib/options breakout))})))))

(defn- update-order-bys [order-bys query stage-path bucketed-breakouts]
  (-> order-bys
      (lib.walk/walk-clauses*
       (fn [clause]
         (when (and (lib.util/clause-of-type? clause #{:field :expression})
                    (not (lib/raw-temporal-bucket clause))
                    (not (lib/binning clause)))
           (let [col (lib.walk/apply-f-for-stage-at-path lib/metadata query stage-path clause)]
             (when-let [matching-breakout (m/find-first (fn [breakout-info]
                                                          (lib.equality/= (:unbucketed-col breakout-info) col))
                                                        bucketed-breakouts)]
               (-> clause
                   (lib/with-temporal-bucket (:bucket matching-breakout))
                   (lib/with-binning (:binning matching-breakout))
                   (lib.options/update-options u/assoc-dissoc :original-temporal-unit (:original-temporal-unit matching-breakout))))))))
      (->> (m/distinct-by lib.schema.util/mbql-clause-distinct-key))
      vec))

(mu/defn- reconcile-bucketing-in-stage :- [:maybe ::lib.schema/stage]
  [query stage-path {breakouts :breakout, order-bys :order-by, :as stage}]
  (when (and (seq breakouts)
             (seq order-bys))
    (when-let [bucketed-breakouts (not-empty (bucketed-breakouts query stage-path stage))]
      (update stage :order-by update-order-bys query stage-path bucketed-breakouts))))

(mu/defn reconcile-breakout-and-order-by-bucketing :- ::lib.schema/query
  "Replace any unbucketed `:field` or `:expression` clauses (anything without `:temporal-unit` or `:bucketing`
  options) in the `order-by` clause with corresponding bucketed clauses used for the same Field/Expression in the
  `breakout` clause.

    {:stages [{:breakout [[:field {:temporal-unit :day} 1]]
               :order-by [[:asc {} [:field {} 1]]]}]}
    ->
    {:stages [{:breakout [[:field {:temporal-unit :day} 1]]
               :order-by [[:asc {} [:field {:temporal-unit :day} 1]]]}]}"
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages
   query
   (fn [query stage-path stage]
     (when (= (:lib/type stage) :mbql.stage/mbql)
       (reconcile-bucketing-in-stage query stage-path stage)))))
