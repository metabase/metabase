(ns metabase.lib.aggregation
  (:refer-clojure :exclude [count distinct max min])
  (:require
   [metabase.lib.common :as lib.common]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu])
  #?(:cljs (:require-macros [metabase.lib.aggregation])))

(lib.common/defop count [] [x])
(lib.common/defop avg [x])
(lib.common/defop count-where [x y])
(lib.common/defop distinct [x])
(lib.common/defop max [x])
(lib.common/defop median [x])
(lib.common/defop min [x])
(lib.common/defop percentile [x y])
(lib.common/defop share [x])
(lib.common/defop stddev [x])
(lib.common/defop sum [x])
(lib.common/defop sum-where [x y])

(mu/defn aggregate :- ::lib.schema/query
  "Adds an aggregation to query."
  ([query an-aggregate-clause]
   (aggregate query -1 an-aggregate-clause))
  ([query stage-number an-aggregate-clause]
   (let [stage-number (or stage-number -1)]
     (lib.util/update-query-stage
       query stage-number
       update :aggregations
       (fn [aggregations]
         (conj (vec aggregations) (lib.common/->op-arg query stage-number an-aggregate-clause)))))))
