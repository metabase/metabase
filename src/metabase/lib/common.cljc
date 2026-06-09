(ns metabase.lib.common
  (:refer-clojure :exclude [mapv])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema.common :as schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv]]))

(comment lib.options/keep-me
         mu/keep-me)

(mu/defn external-op :- [:maybe ::schema.common/external-op]
  "Convert the internal operator `clause` to the external format."
  [[operator options :as clause]]
  (when clause
    {:lib/type :lib/external-op
     :operator (cond-> operator
                 (keyword? operator) name)
     :options  options
     :args     (subvec clause 2)}))

(defmulti ->op-arg
  "Ensures that clause arguments are properly unwrapped"
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defmethod ->op-arg :default
  [x]
  (if (and (vector? x)
           (keyword? (first x)))
    ;; MBQL clause
    (mapv ->op-arg x)
    ;; Something else - just return it
    x))

(defmethod ->op-arg :dispatch-type/sequential
  [xs]
  (mapv ->op-arg xs))

(defmethod ->op-arg :dispatch-type/regex
  [regex]
  (u/regex->str regex))

(defmethod ->op-arg :metadata/column
  [field-metadata]
  (lib.ref/ref field-metadata))

(defmethod ->op-arg :metadata/metric
  [metric-def]
  (lib.ref/ref metric-def))

(defmethod ->op-arg :metadata/segment
  [segment-def]
  (lib.ref/ref segment-def))

(defmethod ->op-arg :metadata/measure
  [measure-def]
  (lib.ref/ref measure-def))

(defmethod ->op-arg :lib/external-op
  [{:keys [operator options args] :or {options {}}}]
  (->op-arg (-> (lib.options/ensure-uuid (into [(keyword operator) options]
                                               (map ->op-arg)
                                               args))
                ((#?(:clj requiring-resolve :cljs resolve) 'metabase.lib.normalize/normalize)))))

(defn defop-create
  "Impl for [[defop]]."
  [op-name args]
  (into [op-name {:lib/uuid (str (random-uuid))}]
        (map ->op-arg)
        args))
