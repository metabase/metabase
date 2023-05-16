(ns metabase.query-processor.middleware.desugar
  (:require
   [medley.core :as m]
   [metabase.mbql.predicates :as mbql.preds]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [schema.core :as s]))

(s/defn desugar :- mbql.s/Query
  "Middleware that uses MBQL lib functions to replace high-level 'syntactic sugar' clauses like `time-interval` and
  `inside` with lower-level clauses like `between`. This is done to minimize the number of MBQL clauses individual
  drivers need to support. Clauses replaced by this middleware are marked `^:sugar` in the MBQL schema."
  [query]
  (m/update-existing query :query (fn [query]
                                    (mbql.u/replace query
                                      (filter-clause :guard mbql.preds/Filter?)
                                      (mbql.u/desugar-filter-clause filter-clause)

                                      (temporal-extract-clause :guard mbql.preds/DatetimeExpression?)
                                      (mbql.u/desugar-temporal-extract temporal-extract-clause)

                                      (expression :guard mbql.preds/FieldOrExpressionDef?)
                                      (mbql.u/desugar-expression expression)))))
