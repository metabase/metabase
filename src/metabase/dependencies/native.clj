(ns metabase.dependencies.native
  "Upstream-dependency extraction for native queries.

  Extracted from `metabase-enterprise.dependencies.native-validation` so that the OSS
  dependency-graph slice (transform dependencies) can compute deps for native transform
  sources; the EE native validation machinery builds on the same functions."
  (:require
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.malli :as mu]))

(mu/defn compile-query :- ::lib.schema/native-only-query
  "Compile a query to native SQL with inline parameters (no JDBC placeholders).

  Uses compile-with-inline-parameters to produce valid SQL that SQLGlot can parse,
  rather than parameterized SQL with ? placeholders.

  Important: We don't preprocess before calling compile-with-inline-parameters because
  parameter substitution must happen INSIDE the *compile-with-inline-parameters* binding
  to produce inline literals instead of ? placeholders."
  [query :- ::lib.schema/query]
  (database-routing/with-database-routing-off
    (let [with-params (lib/add-parameters-for-template-tags query)
          compiled    (qp.compile/compile-with-inline-parameters with-params)]
      (lib/native-query with-params (:query compiled)))))

(mu/defn native-query-deps :- [:set
                               [:or
                                ::driver/native-query-deps.table-dep
                                ::driver/native-query-deps.transform-dep
                                [:map {:closed true} [:snippet ::lib.schema.id/snippet]]
                                [:map {:closed true} [:card ::lib.schema.id/card]]]]
  "Returns the upstream dependencies of a native query, as a set of `{:kind id}` pairs."
  [driver :- :keyword
   query  :- ::lib.schema/native-only-query]
  (let [compiled (compile-query query)]
    (into (driver/native-query-deps driver compiled)
          ;; TODO (Cam 10/1/25) -- Even this much MBQL manipulation outside of Lib is illegal. Move this sort of stuff
          ;; into Lib.
          (keep #(case (:type %)
                   :snippet {:snippet (:snippet-id %)}
                   :card    {:card (:card-id %)}
                   :table   {:table (:table-id %)}
                   nil))
          (lib/all-template-tags query))))
