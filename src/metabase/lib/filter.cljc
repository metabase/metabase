(ns metabase.lib.filter
  (:refer-clojure :exclude [=])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.util.malli :as mu]))

(defmulti ^:private ->filter-arg
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->filter-arg :default
  [_query _stage-number x]
  x)

(defmethod ->filter-arg :metadata/field
  [query stage-number field-metadata]
  (lib.field/field query stage-number field-metadata))

(defmethod ->filter-arg :type/fn
  [query stage-number f]
  (->filter-arg query stage-number (f query stage-number)))

(mu/defn = :- [:or
               fn?
               ::lib.schema.filter/=]
  "Create an `=` filter clause."
  ([x y]
   (fn [query stage-number]
     (= query stage-number x y)))
  ([query stage-number x y & more]
   (-> (into [:=]
             (map (fn [arg]
                    (->filter-arg query stage-number arg)))
             (list* x y more))
       lib.options/ensure-uuid)))
