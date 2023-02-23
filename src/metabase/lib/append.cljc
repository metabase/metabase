(ns metabase.lib.append
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

(defmulti append*
  {:arglists '([stage x])}
  (fn [_stage x]
    (lib.dispatch/dispatch-value x)))

(mu/defn append-to-stage :- :stage/mbql
  [stage :- :stage/mbql
   x]
  (append* stage x))

(mu/defn append :- lib.query/Query
  ([outer-query x]
   (append (lib.util/ensure-mbql-final-stage (lib.util/pipeline outer-query)) -1 x))

  ([outer-query :- lib.query/Query
    stage       :- [:int]
    x]
   ;; TODO -- not sure about this merging logic, but we can worry about that later.
   (let [metadata (merge (:lib/metadata outer-query)
                         #_(:lib/metadata stage))
         x        (lib.interface/resolve x metadata)]
     (lib.util/update-query-stage
      (lib.util/pipeline outer-query)
      stage
      append-to-stage
      x))))
