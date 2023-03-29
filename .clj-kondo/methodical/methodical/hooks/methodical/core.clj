(ns hooks.methodical.core
  (:require [clj-kondo.hooks-api :as hooks]))

(defn add-next-method [fn-tail]
  (if (hooks/vector-node? (first fn-tail))
    (let [[args & body] fn-tail]
      (list*
       (-> (hooks/vector-node
            (cons (hooks/token-node 'next-method)
                  (:children args)))
           (with-meta (meta args)))
       ;; so Kondo stops complaining about it being unused.
       (hooks/token-node 'next-method)
       body))
    (for [list-node fn-tail]
      (hooks/list-node (add-next-method (:children list-node))))))

(defn defmethod
  [{{[_ multimethod & [first-arg :as args]] :children, :as node} :node}]
  #_(clojure.pprint/pprint (hooks/sexpr node))
  (let [[aux-qualifier dispatch-value & fn-tail] (if (#{:before :after :around} (hooks/sexpr first-arg))
                                                   (cons (hooks/sexpr first-arg) (rest args))
                                                   (cons nil args))
        fn-tail                                  (if (contains? #{:around nil} aux-qualifier)
                                                   (add-next-method fn-tail)
                                                   fn-tail)
        result                                   (hooks/list-node
                                                  (list* (hooks/token-node 'clojure.core/defmethod)
                                                         multimethod
                                                         dispatch-value
                                                         fn-tail))]
    #_(println "=>")
    #_(clojure.pprint/pprint (hooks/sexpr result))
    {:node result}))

(defn defmulti
  [{{[_ multimethod-name & args] :children, :as node} :node}]
  #_(clojure.pprint/pprint (hooks/sexpr node))
  (let [[docstring & args]         (if (hooks/string-node? (first args))
                                     args
                                     (cons nil args))
        [attribute-map & args]     (if (hooks/map-node? (first args))
                                     args
                                     (cons nil args))
        ;; if there wasn't a positional dispatch function arg passed just use (constantly nil) so Kondo won't complain
        [dispatch-fn & kv-options] (if (odd? (count args))
                                     args
                                     (cons (hooks/list-node
                                            (list
                                             (hooks/token-node 'clojure.core/constantly)
                                             (hooks/token-node 'nil)))
                                           args))]
    (let [defmulti-form (hooks/list-node
                         (filter
                          some?
                          [(hooks/token-node 'clojure.core/defmulti)
                           multimethod-name
                           docstring
                           attribute-map
                           dispatch-fn]))
          result   (hooks/list-node
                    (list*
                     (hooks/token-node 'do)
                     defmulti-form
                     kv-options))]
      #_(println "=>")
      #_(clojure.pprint/pprint (hooks/sexpr result))
      {:node result})))
