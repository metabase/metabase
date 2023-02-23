(ns metabase.lib.filter
  (:refer-clojure :exclude [=])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.options :as lib.options]
   [metabase.lib.resolve :as lib.resolve]
   [metabase.lib.schema]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

;;; TODO -- this doesn't belong here.
(defmulti ->mbql
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->mbql :default
  [x]
  x)

(defmethod ->mbql :metadata/field
  [x]
  (lib.field/field x))

(mu/defn = :- :mbql/=
  [& args]
  (lib.options/ensure-uuid (into [:=]
                                 (map ->mbql)
                                 args)))

(defmethod lib.resolve/resolve :=
  [metadata [_equals options & args]]
  (assert (map? options))
  (into [:= options]
        (map (partial lib.resolve/resolve metadata))
        args))
