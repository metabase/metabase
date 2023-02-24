(ns metabase.lib.filter
  (:refer-clojure :exclude [=])
  (:require
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.util.malli :as mu]))

(mu/defn = :- ::lib.schema.filter/=
  "Create an `=` filter clause."
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
