(ns metabase.lib.append
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

(defmulti append*
  {:arglists '([metadata inner-query x])}
  (fn [_metadata _inner-query x]
    (lib.dispatch/dispatch-value x)))

(mu/defn append :- lib.query/Query
  ([query x]
   (append (lib.util/ensure-mbql-final-stage query) -1 x))

  ([query :- lib.query/Query
    stage :- [:int]
    x]
   (lib.util/update-query-stage
    query
    stage
    (fn [inner-query]
      ;; TODO -- this should merge in the metadata for the inner query as well?
      (append* (:metabase.lib.query/metadata query) inner-query x)))))
