(ns metabase.lib.breakout
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn breakout :- ::lib.schema/query
  "Add a new breakout on an expression, presumably a Field reference."
  ([query expr]
   (breakout query -1 expr))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    expr         :- [:or ::lib.schema.expression/expression fn?]]
   (let [expr (if (fn? expr)
                (expr query stage-number)
                expr)]
     (lib.util/update-query-stage query stage-number update :breakout (fn [breakouts]
                                                                        (conj (vec breakouts) expr))))))
