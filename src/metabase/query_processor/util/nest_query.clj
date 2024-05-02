(ns metabase.query-processor.util.nest-query
  "Utility functions for raising/nesting parts of MBQL queries. Currently, this only has [[nest-expressions]], but in
  the future hopefully we can generalize this a bit so we can do more things that require us to introduce another
  level of nesting, e.g. support window functions.

   (This namespace is here rather than in the shared MBQL lib because it relies on other QP-land utils like the QP
  refs stuff.)"
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.transformations.nest-expressions :as transformations.nest-expressions]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn nest-expressions :- mbql.s/MBQLQuery
  "Pushes the `:source-table`/`:source-query`, `:expressions`, and `:joins` in the top-level of the query into a
  `:source-query` and updates `:expression` references and `:field` clauses with `:join-alias`es accordingly. See
  tests for examples. This is used by the SQL QP to make sure expressions happen in a subselect."
  [inner-query :- mbql.s/MBQLQuery]
  (let [mlv2-query (lib.query/query-from-legacy-inner-query
                    (qp.store/metadata-provider)
                    (u/the-id (lib.metadata/database (qp.store/metadata-provider)))
                    inner-query)]
    (-> (transformations.nest-expressions/nest-expressions mlv2-query)
        lib.convert/->legacy-MBQL
        :query)))
