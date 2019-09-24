(ns metabase.query-processor.middleware.desugar
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.util :as u]
            [schema.core :as s]))

(s/defn ^:private desugar* :- mbql.s/Query
  [query]
  (u/update-when query :query (fn [query]
                                (mbql.u/replace query
                                  (m :guard (every-pred map? :filter))
                                  (update m :filter mbql.u/desugar-filter-clause)))))

(defn desugar
  "Middleware that uses MBQL lib functions to replace high-level 'syntactic sugar' clauses like `time-interval` and
  `inside` with lower-level clauses like `between`. This is done to minimize the number of MBQL clauses individual
  drivers need to support. Clauses replaced by this middleware are marked `^:sugar` in the MBQL schema."
  [qp]
  (comp qp desugar*))
