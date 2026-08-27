(ns metabase.query-processor.middleware.nest-for-pivot
  "Preprocessing middleware that reshapes pivot queries so the native pivot SQL emitter can compile them.

  Two transformations, applied only when the last stage carries a `:pivot` clause:

  1. Strip non-aggregation `:order-by` clauses (they'd reference columns that aren't in the GROUP BY).

  2. If any breakout is a nested-field column (e.g. JSON-unfolded), split the stage into two: an inner
     projection that materializes each nested-field breakout as a named `:expressions` entry, and an outer
     stage that takes the original breakouts/aggregations/pivot/order-by with refs rewritten to point at
     the inner stage's projection. Without this, the SQL compiler emits the JSON path expression inline in
     both `GROUPING SETS` and `GROUPING(...)`, and Postgres' plan-time GROUPING-matcher rejects the query
     because each parameterized appearance looks distinct.

  Position in the preprocess pipeline: after `metrics/adjust`, `measures/adjust`, `expand-macros`, and
  `add-remaps/add-remapped-columns` (so we see concrete refs and already-added remap pairs), before
  `add-implicit-clauses` (which would add `:fields` and restrict the inner projection)."
  (:refer-clojure :exclude [empty? mapv select-keys some])
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.pivot :as lib.pivot]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]
   ^{:clj-kondo/ignore [:metabase/modules]}
   [metabase.query-processor.middleware.add-remaps :as-alias add-remaps]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf :refer [empty? mapv select-keys some]]))

(set! *warn-on-reflection* true)

(mu/defn remove-non-aggregation-order-bys :- ::lib.schema/query
  "Keep only `:aggregation`-based `:order-by` clauses on `query`. Used by the pivot path because pivot
  introduces its own `GROUP BY` shape; any user order-by that references a column not in the GROUP BY would
  be invalid SQL.

  Exposed (rather than private) so unit tests can target it directly; the production entry point is
  [[nest-for-pivot]]."
  [query :- ::lib.schema/query]
  (reduce
   (fn [query [_tag _opts expr :as order-by]]
     (cond-> query
       (not (lib.util/clause-of-type? expr :aggregation))
       (lib/remove-clause order-by)))
   query
   (lib.order-by/order-bys query)))

(defn- has-nested-field-breakout?
  "True iff any breakout in the last stage of `query` is a nested-field (e.g. JSON-unfolded) column."
  [query]
  (boolean (some :nfc-path (lib/breakouts-metadata query))))

(mu/defn wrap-nested-field-breakouts :- ::lib.schema/query
  "If `query`'s last stage has any nested-field (e.g. JSON-unfolded) breakout, restructure the stage as two
  stages: an inner projection that pre-computes each nested-field breakout as a named `:expressions` entry,
  and an outer stage that takes back the original breakouts, aggregations, `:pivot`, and `:order-by` — with
  each `:field` ref rewritten to a name-based reference into the inner stage's outputs.

  Otherwise returns `query` unchanged.

  Exposed (rather than private) so unit tests can target it directly; the production entry point is
  [[nest-for-pivot]]."
  [query :- ::lib.schema/query]
  (let [breakout-cols (vec (lib/breakouts-metadata query))
        nfc-positions (into [] (keep-indexed (fn [i col] (when (:nfc-path col) i))) breakout-cols)]
    (if (empty? nfc-positions)
      query
      (let [og-breakouts (vec (lib/breakouts query))
            og-aggs      (vec (lib/aggregations query))
            og-pivot     (lib.pivot/pivot query)
            og-order-bys (vec (lib.order-by/order-bys query))
            nfc-set      (set nfc-positions)
            ;; Generate one expression name per nested-field breakout. Prime with visible-column names so
            ;; collisions with real source columns (or with existing expressions) get suffixed.
            name-gen     (lib.util.unique-name-generator/unique-name-generator
                          (mapv :name (lib/visible-columns query)))
            expr-name-by-pos (into {}
                                   (map (fn [i] [i (name-gen "__mb_pivot_nfc")]))
                                   nfc-positions)
            ;; Add an expression for each nested-field breakout to the inner stage. Re-UUID the clause so it
            ;; doesn't collide with the original breakout clause's UUID, which we preserve on the outer-stage
            ;; breakout below.
            with-exprs   (reduce-kv (fn [q i expr-name]
                                      (lib/expression q expr-name (lib.util/fresh-uuids (nth og-breakouts i))))
                                    query
                                    expr-name-by-pos)
            ;; Strip the inner stage's `:breakout`, `:aggregation`, `:pivot`, and `:order-by`. What's left
            ;; (`:source-*`, `:joins`, `:filter`, plus the new `:expressions`) is the data-shaping prefix
            ;; the inner subquery needs.
            inner-only   (-> with-exprs
                             lib/remove-all-breakouts
                             lib/remove-all-aggregations
                             lib.order-by/remove-all-order-bys
                             (lib.pivot/with-pivot nil))
            outer-base   (lib/append-stage inner-only)
            outer-cols   (lib/visible-columns outer-base)
            id->col      (m/index-by :id (filter :id outer-cols))
            alias->col   (m/index-by :lib/source-column-alias outer-cols)
            ;; Build a name-based field ref to `col`, taking `:lib/uuid` (and optional pass-through
            ;; `keep-opts` like `:temporal-unit` and `:binning`) from an original clause `og`.
            outer-ref (fn [col og keep-opts]
                        (-> (lib.ref/ref col)
                            (lib.options/update-options
                             merge
                             (select-keys (lib.options/options og) (cons :lib/uuid keep-opts)))))
            ;; Rewrite refs in `form` so they're valid on the outer stage. Per ref type:
            ;;   * `:field` int-id    → rewrite to a name-based field ref to the inner stage's projection
            ;;                          (source-table fields aren't directly reachable from the outer stage)
            ;;   * `:field` string    → keep (already a name-based previous-stage ref)
            ;;   * `:expression`      → rewrite to a name-based field ref (the inner stage's expressions
            ;;                          become previous-stage *columns* in the outer view)
            ;;   * `:aggregation`     → keep (we re-add aggregations with their UUIDs preserved below, so
            ;;                          the ref still resolves)
            ;;   * `:segment`/`:metric`/`:measure` → keep (expanded by middleware that runs before this one)
            field-keep-opts [:temporal-unit :binning
                             ::add-remaps/original-field-dimension-id
                             ::add-remaps/new-field-dimension-id]
            rewrite-refs
            (fn [form]
              (perf/postwalk
               (fn [x]
                 (if-not (lib.util/ref-clause? x)
                   x
                   (case (first x)
                     :field      (if (pos-int? (last x))
                                   (outer-ref (id->col (last x)) x field-keep-opts)
                                   x)
                     :expression (outer-ref (alias->col (last x)) x [])
                     x)))
               form))
            ;; Nested-field breakouts need explicit handling: the inner stage's original column (still
            ;; `:nfc-path`-tagged, propagated through the previous stage) and the synthetic expression both
            ;; appear in `outer-cols` and share the same source-table id. We point the outer breakout at
            ;; the synthetic expression by its name, not at the original column.
            with-breakouts
            (reduce (fn [q [i bo]]
                      (lib/breakout q (if (nfc-set i)
                                        (outer-ref (alias->col (expr-name-by-pos i)) bo field-keep-opts)
                                        (rewrite-refs bo))))
                    outer-base
                    (map-indexed vector og-breakouts))
            with-aggs
            (reduce (fn [q agg] (lib/aggregate q (rewrite-refs agg)))
                    with-breakouts
                    og-aggs)
            with-order-bys
            (reduce (fn [q [direction _opts expr]]
                      (lib.order-by/order-by q (rewrite-refs expr) direction))
                    with-aggs
                    og-order-bys)]
        (cond-> with-order-bys
          og-pivot (lib.pivot/with-pivot og-pivot))))))

(mu/defn nest-for-pivot :- ::lib.schema/query
  "Preprocessing entry point: applies [[remove-non-aggregation-order-bys]] and (when there are nested-field
  breakouts) [[wrap-nested-field-breakouts]]. No-op when `query`'s last stage has no `:pivot` clause."
  [query :- ::lib.schema/query]
  (cond-> query
    (lib.pivot/has-pivot? query)
    (-> remove-non-aggregation-order-bys
        (cond-> (has-nested-field-breakout? query) wrap-nested-field-breakouts))))
