(ns metabase.query-processor.middleware.desugar
  (:require [medley.core :as m]
            [metabase.mbql
             [predicates :as mbql.preds]
             [schema :as mbql.s]
             [util :as mbql.u]]
            [schema.core :as s]))

(s/defn ^:private desugar* :- mbql.s/Query
  [query]
  (m/update-existing query :query (fn [query]
                                    (mbql.u/replace query
                                                    (filter-clause :guard mbql.preds/Filter?)
                                                    (mbql.u/desugar-filter-clause filter-clause)))))

(defn desugar
  "Middleware that uses MBQL lib functions to replace high-level 'syntactic sugar' clauses like `time-interval` and
  `inside` with lower-level clauses like `between`. This is done to minimize the number of MBQL clauses individual
  drivers need to support. Clauses replaced by this middleware are marked `^:sugar` in the MBQL schema."
  [qp]
  (fn [query rff context]
    (qp (desugar* query) rff context)))
