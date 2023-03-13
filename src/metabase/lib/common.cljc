(ns metabase.lib.common
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   #_{:clj-kondo/ignore [:unused-namespace]}
   [metabase.lib.options :as lib.options])
  #?(:cljs (:require-macros [metabase.lib.common])))

(defmulti ->op-arg
  "Ensures that clause arguments are properly unwrapped"
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->op-arg :default
  [_query _stage-number x]
  x)

(defmethod ->op-arg :metadata/field
  [query stage-number field-metadata]
  (lib.field/field query stage-number field-metadata))

(defmethod ->op-arg :dispatch-type/fn
  [query stage-number f]
  (->op-arg query stage-number (f query stage-number)))

#?(:clj
   (defmacro defop
     "Defines a clause creating function with given args.
      Calling the clause without query and stage produces a fn that can be resolved later."
     [op-name argvec]
     {:pre [(symbol? op-name)
            (vector? argvec) (every? symbol? argvec)
            (not-any? #{'query 'stage-number} argvec)]}
     (let [arglist-expr (if (contains? (set argvec) '&)
                          (cons 'list* (remove #{'&} argvec))
                          argvec)]
       `(mu/defn ~op-name :- [:or fn? ~(keyword "mbql.clause" (name op-name))]
          ~(format "Create a clause of type `%s`." (name op-name))
          ([~@argvec]
           (fn [~'query ~'stage-number]
             (~op-name ~'query ~'stage-number ~@argvec)))
          ([~'query ~'stage-number ~@argvec]
           (-> (into [~(keyword op-name)]
                     (map (fn [~'arg]
                            (->op-arg ~'query ~'stage-number ~'arg)))
                     ~arglist-expr)
               lib.options/ensure-uuid))))))
