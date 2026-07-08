(ns metabase.lib.stage.util
  "General stage-related utility functions that don't require a any other Lib namespaces except for very general
  high-level ones like `lib.schema` and `lib.util`. This namespace was spun out from [[metabase.lib.stage]] to avoid
  circular dependencies between it and other Lib namespaces."
  (:refer-clojure :exclude [not-empty])
  (:require
   [medley.core :as m]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [not-empty]]))

(mu/defn has-clauses? :- :boolean
  "Does given query stage have any clauses?"
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (-> (lib.util/query-stage query stage-number)
      (dissoc :source-table :source-card)
      (->> (m/filter-keys simple-keyword?))
      not-empty
      boolean))

(mu/defn append-stage :- ::lib.schema/query
  "Adds a new blank stage to the end of the pipeline."
  [query]
  (update query :stages conj {:lib/type :mbql.stage/mbql}))

(mu/defn drop-stage :- ::lib.schema/query
  "Drops the final stage in the pipeline, will no-op if it is the only stage"
  [query]
  (if (= 1 (count (:stages query)))
    query
    (update query :stages pop)))

(mu/defn drop-empty-stages :- ::lib.schema/query
  "Drops all empty stages in the pipeline."
  [query :- ::lib.schema/query]
  (update query :stages (fn [stages]
                          (into []
                                (keep-indexed (fn [stage-number stage]
                                                (when (or (zero? stage-number)
                                                          (has-clauses? query stage-number))
                                                  stage)))
                                stages))))
