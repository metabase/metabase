(ns metabase.lib.referenced-columns
  "The natural home for `referenced-columns` would be next to `returned-columns` and friends in
  `metabase.lib.metadata.calculation`, but the implementation is built on
  [[metabase.lib.fe-util/expression-parts]], and requiring [[metabase.lib.fe-util]] from there
  would create a dependency cycle. So it lives in its own namespace downstream of `fe-util`
  instead."
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defn- column-metadata?
  [x]
  (and (map? x) (= :metadata/column (:lib/type x))))

(defn- expression-parts-map?
  [x]
  (and (map? x) (= :mbql/expression-parts (:lib/type x))))

(defn- referenced-columns* [parts]
  (cond
    (column-metadata? parts)      [parts]
    (expression-parts-map? parts) (into [] (mapcat referenced-columns*) (:args parts))
    :else                         []))

(mu/defn referenced-columns :- [:sequential ::lib.schema.metadata/column]
  "Returns the column-metadata leaves referenced by `x`, where `x` is a clause (filter, aggregation,
  expression) or a column-metadata map, resolved relative to the target stage of `query`.

  Columns appear in traversal order; duplicates are NOT removed — callers may `distinct` if
  dedup semantics are needed.

  Throws if `x` is neither an MBQL clause nor a `:metadata/column` map. Schema validation is
  off in production, so the runtime check is the gate."
  ([query x] (referenced-columns query -1 x))
  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (when-not (or (column-metadata? x) (lib.util/clause? x))
     (throw (ex-info "referenced-columns: expected an MBQL clause or :metadata/column"
                     {:dispatch-value (lib.dispatch/dispatch-value x)
                      :input          x})))
   (referenced-columns* (lib.fe-util/expression-parts query stage-number x))))
