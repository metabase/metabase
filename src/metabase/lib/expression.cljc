(ns metabase.lib.expression
  (:refer-clojure :exclude [+ abs])
  (:require
    [metabase.lib.dispatch :as lib.dispatch]
    [metabase.lib.field :as lib.field]
    metabase.lib.options
    metabase.lib.schema.expression
    #?@(:clj ([metabase.util.malli :as mu])))
  #?(:cljs (:require-macros [metabase.lib.expression])))

(defmulti ^:private ->expression-arg
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->expression-arg :default
  [query stage-number x]
  (if (vector? x)
    (mapv #(->expression-arg query stage-number %) x)
    x))

(defmethod ->expression-arg :metadata/field
  [query stage-number field-metadata]
  (lib.field/field query stage-number field-metadata))

(defmethod ->expression-arg :dispatch-type/fn
  [query stage-number f]
  (->expression-arg query stage-number (f query stage-number)))

#?(:clj
   (defmacro ^:private defexpression
     [expression-name argvec]
     {:pre [(symbol? expression-name)
            (vector? argvec) (every? symbol? argvec)
            (not-any? #{'query 'stage-number} argvec)]}
     (let [arglist-expr (if (.contains argvec '&)
                          (cons 'list* (remove #{'&} argvec))
                          argvec)]
       `(mu/defn ~expression-name :- ~(keyword "metabase.lib.schema.expression" (name expression-name))
          ~(format "Create an expression clause of type `%s`." (name expression-name))
          [~'query ~'stage-number ~@argvec]
          (-> (into [~(keyword expression-name)]
                    (map (fn [~'arg]
                           (->expression-arg ~'query ~'stage-number ~'arg)))
                    ~arglist-expr)
              metabase.lib.options/ensure-uuid)))))

(metabase.lib.expression/defexpression abs [x])
