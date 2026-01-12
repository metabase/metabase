(ns metabase.query-processor.middleware.desugar
  (:refer-clojure :exclude [select-keys])
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [select-keys]]))

(defn- desugar*
  [stage-or-join]
  (letfn [(desugar** [x]
            (lib.util.match/replace x
              (clause :guard lib.util/clause?)
              (lib/desugar-filter-clause clause)))]
    (merge
     (desugar** (dissoc stage-or-join :joins :stages :lib/stage-metadata :parameters))
     (select-keys stage-or-join [:joins :stages :lib/stage-metadata :parameters]))))

(mu/defn desugar :- ::lib.schema/query
  "Middleware that uses MBQL lib functions to replace high-level 'syntactic sugar' clauses like `time-interval` and
  `inside` with lower-level clauses like `between`. This is done to minimize the number of MBQL clauses individual
  drivers need to support. Clauses replaced by this middleware are marked `^:sugar` in the MBQL schema."
  [query :- ::lib.schema/query]
  (lib.walk/walk query (fn [_query _path-type _path stage-or-join]
                         (desugar* stage-or-join))))
