(ns metabase.lib.filter
  (:refer-clojure :exclude [=])
  (:require
   [metabase.lib.field :as lib.field]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

(mu/defn = :- :mbql/=
  [& args]
  (lib.options/ensure-uuid (into [:=]
                                 (map lib.interface/->mbql)
                                 args)))

(defmethod lib.interface/resolve :=
  [[_equals options & args] metadata]
  (assert (map? options))
  (into [:= options]
        (map #(lib.interface/resolve % metadata))
        args))
