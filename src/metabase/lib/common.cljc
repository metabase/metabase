(ns metabase.lib.common
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   #_{:clj-kondo/ignore [:unused-namespace]}
   [metabase.lib.options :as lib.options]
   #_{:clj-kondo/ignore [:unused-namespace]}
   [metabase.util.malli :as mu])
  #?(:cljs (:require-macros [metabase.lib.common])))

(defmulti ->op-arg
  "Ensures that clause arguments are properly unwrapped"
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->op-arg :default
  [query stage-number x]
  (if (vector? x)
    (mapv #(->op-arg query stage-number %) x)
    x))

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
     [op-name & argvecs]
     {:pre [(symbol? op-name)
            (every? vector? argvecs) (every? #(every? symbol? %) argvecs)
            (every? #(not-any? #{'query 'stage-number} %) argvecs)]}
     `(do
          (mu/defn ~(symbol (str (name op-name) "-clause")) :- ~(keyword "mbql.clause" (name op-name))
            ~(format "Create a standalone clause of type `%s`." (name op-name))
            ~@(for [argvec argvecs
                    :let [arglist-expr (if (contains? (set argvec) '&)
                                         (cons `list* (remove #{'&} argvec))
                                         argvec)]]
                `([~'query ~'stage-number ~@argvec]
                  (-> (into [~(keyword op-name)]
                            (map (fn [~'arg]
                                   (->op-arg ~'query ~'stage-number ~'arg)))
                            ~arglist-expr)
                      lib.options/ensure-uuid))))

          (mu/defn ~op-name :- fn?
            ~(format "Create a closure of clause of type `%s`." (name op-name))
            ~@(for [argvec argvecs
                    :let [arglist-expr (if (contains? (set argvec) '&)
                                         (filterv (complement #{'&}) argvec)
                                         (conj argvec []))]]
               `([~@argvec]
                 (fn ~(symbol (str (name op-name) "-closure"))
                   [~'query ~'stage-number]
                   (apply ~(symbol (str (name op-name) "-clause")) ~'query ~'stage-number ~@arglist-expr))))))))
