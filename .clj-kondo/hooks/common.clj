(ns hooks.common
  (:require [clj-kondo.hooks-api :as hooks]))

(defn do*
  "This is basically the same as [[clojure.core/do]] but doesn't cause Kondo to complain about redundant dos."
  [{{[_ & args] :children, :as node} :node}]
  #_(clojure.pprint/pprint (hooks/sexpr node))
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'do)
                args))]
    #_(clojure.pprint/pprint (hooks/sexpr node*))
    {:node node*}))

(defn with-two-top-level-bindings
  "Helper for macros that have a shape like

    (my-macro x y
      ...)

    =>

    (let [x nil, y nil]
      ...)"
  [{{[_ & [x y & body]] :children, :as node} :node}]
  ;; (println \newline)
  ;; (clojure.pprint/pprint (hooks/sexpr node))
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [x (hooks/token-node 'nil)
                  y (hooks/token-node 'nil)])
                body))]
    ;; (println '=>)
    ;; (clojure.pprint/pprint (hooks/sexpr node*))
    {:node node*}))
