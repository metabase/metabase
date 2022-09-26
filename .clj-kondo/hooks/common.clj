(ns hooks.common
  (:require [clj-kondo.hooks-api :as hooks]
            [clojure.pprint]))

;;; This stuff is to help debug hooks. Trace a function and it will pretty-print the before & after sexprs.
;;;
;;;    (hooks.common/trace #'calculate-bird-scarcity)

(defn- trace* [f]
  {:pre [(fn? f)]}
  (fn traced-fn [node]
    (println \newline)
    (clojure.pprint/pprint (hooks/sexpr (:node node)))
    (let [node* (f node)]
      (println '=>)
      (clojure.pprint/pprint (hooks/sexpr (:node node*)))
      node*)))

;;; this doesn't seem to work with SCI. Use [[defn-traced]] instead.

;; (defn trace [varr]
;;   {:pre [(var? varr)]}
;;   (when-not (::traced? (meta varr))
;;     (alter-var-root varr trace*)
;;     (alter-meta! varr assoc ::traced? true)
;;     (println "Traced" varr)))

(defmacro defn-traced
  "Replace a hook [[defn]] with this to trace the before and after sexprs."
  [fn-name & fn-tail]
  `(do
     (defn fn# ~@fn-tail)
     (def ~fn-name (trace* fn#))))

;;;; Common hook definitions

(defn do*
  "This is basically the same as [[clojure.core/do]] but doesn't cause Kondo to complain about redundant dos."
  [{{[_ & args] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'do)
                args))]
    {:node node*}))

(defn with-one-binding
  "Helper for macros that have a shape like

    (my-macro [x]
      ...)

    =>

    (let [x nil]
      ...)

  Binding is optional and `_` will be substituted if not supplied."
  [{{[_ {[x] :children} & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [(or x (hooks/token-node '_)) (hooks/token-node 'nil)])
                body))]
    {:node node*}))

(defn with-two-bindings
  "Helper for macros that have a shape like

    (my-macro [x y]
      ...)

    =>

    (let [x nil, y nil]
      ...)

  All bindings are optional and `_` will be substituted if not supplied."
  [{{[_ {[x y] :children} & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [(or x (hooks/token-node '_)) (hooks/token-node 'nil)
                  (or y (hooks/token-node '_)) (hooks/token-node 'nil)])
                body))]
    {:node node*}))

(defn with-three-bindings
  "Helper for macros that have a shape like

    (my-macro [x y z]
      ...)

    =>

    (let [x nil, y nil, z nil]
      ...)

  All bindings are optional and `_` will be substituted if not supplied."
  [{{[_ {[x y z] :children} & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [(or x (hooks/token-node '_)) (hooks/token-node 'nil)
                  (or y (hooks/token-node '_)) (hooks/token-node 'nil)
                  (or z (hooks/token-node '_)) (hooks/token-node 'nil)])
                body))]
    {:node node*}))

(defn with-four-bindings
  "Helper for macros that have a shape like

    (my-macro [a b c d]
      ...)

    =>

    (let [a nil, b nil, c nil, d nil]
      ...)

  All bindings are optional and `_` will be substituted if not supplied."
  [{{[_ {[a b c d] :children} & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [(or a (hooks/token-node '_)) (hooks/token-node 'nil)
                  (or b (hooks/token-node '_)) (hooks/token-node 'nil)
                  (or c (hooks/token-node '_)) (hooks/token-node 'nil)
                  (or d (hooks/token-node '_)) (hooks/token-node 'nil)])
                body))]
    {:node node*}))

(defn with-one-top-level-binding
  "Helper for macros that have a shape like

    (my-macro x
      ...)

    =>

    (let [x nil]
      ...)"
  [{{[_ x & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [x (hooks/token-node 'nil)])
                body))]
    {:node node*}))

(defn with-two-top-level-bindings
  "Helper for macros that have a shape like

    (my-macro x y
      ...)

    =>

    (let [x nil, y nil]
      ...)"
  [{{[_ x y & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [x (hooks/token-node 'nil)
                  y (hooks/token-node 'nil)])
                body))]
    {:node node*}))

(defn let-one-with-optional-value
  "This is exactly like [[clojure.core/let]] but the right-hand side of the binding, `value`, is optional, and only one
  binding can be established.

    (some-macro [x] ...)
    =>
    (let [x nil] ...)

    (some-macro [x 100] ...)
    =>
    (let [x 100] ...)"
  [{{[_ {[binding value] :children} & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [binding (or value (hooks/token-node 'nil))])
                body))]
    {:node node*}))

(defn let-with-optional-value-for-last-binding
  "This is exactly like [[clojure.core/let]] but the right-hand side of the *last* binding, `value`, is optional.

    (some-macro [x] ...)
    =>
    (let [x nil] ...)

    (some-macro [x 100] ...)
    =>
    (let [x 100] ...)"
  [{{[_ {bindings :children} & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 (into []
                       (comp (partition-all 2)
                             (mapcat (fn [[binding value]]
                                       [binding (or value (hooks/token-node 'nil))])))
                       bindings))
                body))]
    {:node node*}))

(defn with-ignored-first-arg
  "For macros like

    (discard-setting-changes [setting-1 setting-2]
      ...)

    =>

    (do ...)

  where the first arg ought to be ignored for linting purposes."
  [{{[_ _x & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'do)
                body))]
    {:node node*}))
