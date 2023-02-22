(ns metabase.lib.append
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.query :as lib.query]
   [metabase.lib.resolve :as lib.resolve]
   [metabase.lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

(defmulti append*
  {:arglists '([inner-query x])}
  (fn [_inner-query x]
    (lib.dispatch/dispatch-value x)))

(mu/defn append-to-inner-query :- :mbql/inner-query
  [inner-query :- :mbql/inner-query
   x]
  (append* inner-query x))

(mu/defn append :- lib.query/Query
  ([outer-query x]
   (append (lib.util/ensure-mbql-final-stage outer-query) -1 x))

  ([outer-query :- lib.query/Query
    stage       :- [:int]
    x]
   ;; TODO -- not sure about this merging logic, but we can worry about that later.
   (let [metadata (merge (:lib/metadata outer-query)
                         #_(:lib/metadata inner-query))
         x        (lib.resolve/resolve metadata x)]
     (lib.util/update-query-stage
      outer-query
      stage
      append-to-inner-query
      x))))
