(ns metabase.lib.aggregation
  (:refer-clojure :exclude [count distinct max min])
  (:require
   [metabase.lib.common :as lib.common]
   [metabase.lib.options :as lib.options]
   [metabase.util.malli :as mu])
  #?(:cljs (:require-macros [metabase.lib.aggregation])))

(mu/defn count :- [:or
                   fn?
                   :mbql.clause/count]
  "Create a `count` filter clause."
  ([]
   #_{:clj-kondo/ignore [:redundant-fn-wrapper]}
   (fn [query stage-number]
     (count query stage-number)))
  ([x]
   (fn [query stage-number]
     (count query stage-number x)))
  ([_query _stage-number]
   (lib.options/ensure-uuid [:count]))
  ([query stage-number x]
   (lib.options/ensure-uuid [:count (lib.common/->op-arg query stage-number x)])))

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
