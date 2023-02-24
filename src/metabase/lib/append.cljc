(ns metabase.lib.append
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defmulti append*
  "Implementation for [[append]]. Tell [[append]] how to append something to an MBQL stage, e.g. an `:asc` MBQL clause
  should get appended to `:order-by` list."
  {:arglists '([stage x])}
  (fn [_stage x]
    (lib.dispatch/dispatch-value x)))

(mu/defn append :- ::lib.schema/query
  "Add any sort of MBQL clause to the appropriate part of an MBQL `query`. What 'the appropriate part' is depends on
  what you're trying to add. `x` might be something like an `:order-by` clause, in which case it gets appended to the
  vector of `:order-by`s in the query.

  Specific behaviors for different clauses is implemented by [[append*]].

  Unless you specify otherwise, things will be appended to the last stage of the query. Specify a specific `stage`
  number to append something to a part of the query other than the last part.

  If `stage` is unspecified, and the final stage of the query IS NOT MBQL (i.e., we're working with a pure native
  query), this will add an additional MBQL stage to the query automatically."
  ([query x]
   (append (lib.util/ensure-mbql-final-stage (lib.util/pipeline query)) -1 x))

  ([query :- ::lib.schema/query
    stage :- [:int]
    x]
   ;; TODO -- at some point we need to figure out how to merge metadata from the previous and current stages of the
   ;; query, for example to figure out if a given Field should have some specific join alias or something like that
   (let [metadata (merge (:lib/metadata query)
                         #_(:lib/metadata stage))
         x        (lib.interface/resolve x metadata)]
     (lib.util/update-query-stage
      (lib.util/pipeline query)
      stage
      append*
      x))))
