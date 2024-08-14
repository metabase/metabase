(ns metabase.lib.common
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema.common :as schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu])
  #?(:cljs (:require-macros [metabase.lib.common])))

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

(defmethod ->op-arg :lib/external-op
  [{:keys [operator options args] :or {options {}}}]
  (->op-arg (lib.options/ensure-uuid (into [(keyword operator) options]
                                           (map ->op-arg)
                                           args))))

(defn defop-create
  "Impl for [[defop]]."
  [op-name args]
  (into [op-name {:lib/uuid (str (random-uuid))}]
        (map ->op-arg)
        args))

#?(:clj
   (defmacro defop
     "Defines a clause creating function with given args.
      Calling the clause without query and stage produces a fn that can be resolved later."
     [op-name & argvecs]
     {:pre [(symbol? op-name)
            (every? vector? argvecs) (every? #(every? symbol? %) argvecs)
            (every? #(not-any? #{'query 'stage-number} %) argvecs)]}
     `(mu/defn ~op-name :- ~(keyword "mbql.clause" (name op-name))
        ~(format "Create a standalone clause of type `%s`." (name op-name))
        ~@(for [argvec argvecs
                :let [arglist-expr (if (contains? (set argvec) '&)
                                     (cons `list* (remove #{'&} argvec))
                                     argvec)]]
            `([~@argvec]
              (defop-create ~(keyword op-name) ~arglist-expr))))))
