(ns better-cond.core
  "A clj-kondo hook to allow linting of better-cond `cond` macro.
  This supports better-cond version 2.0.0+.

  To use in a project, change the namespace to hooks.better-cond,
  put this code in file .clj-kondo/hooks/better_cond.clj, and include
  a config.edn entry in the :hooks key like:

    :hooks {:analyze-call {better-cond.core/cond hooks.better-cond/cond}}

  Note that the expansion of :when-let and :when-some forms currently
  takes a shortcut that *would* lead to incorrect values in some
  cases of restructuring during actual expansion/evaluation, e.g.,
  :when-let [[x y] nil] would not abort the cond, though :when-let
  [[x y] [nil nil]] would. However, for linting purposes, the current
  expansion approach works just fine. It seems unnecessary to do the
  full expansion in these cases for linting purposes, though that could
  be done if needed."
  (:refer-clojure :exclude [cond])
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]))

(def better-cond-simple-keys
  "Special constructs in better cond, either as keywords or symbols.
  This includes those keys that are simply transformed. Note that
  :when-let and :when-some are *not* included as better-cond allows
  multiple bindings but clojure does not. These two must be handled
  separately."
  #{:let :when :do
    'let 'when 'do})

(def better-cond-complex-keys
  "Special constructs in better cond, either as keywords or symbols.
  This includes those keys that require a multi-step transformation.
  For example, :when-let and :when-some get converted to a let
  wrapping a when, wrapping the continuing cond. Note that clojure
  does not support multiple bindings in the standard when-let and
  when-some macros."
  {:when-let  'identity
   'when-let  'identity
   :when-some 'some?
   'when-some 'some?})

(defn extract-binding-forms
  [bindings]
  (keep-indexed #(when (even? %1) %2) bindings))

(defn process-pairs
  "Transforms a `cond` with the clauses given as a collection of explicit pairs.
  Handles all the special better-cond constructs as keywords or symbols.
  Returns a rewrite-clj list-node representing the transformed code."
  [node-pairs]
  (loop [[[lhs rhs :as pair] & pairs] node-pairs
         new-body [(api/token-node 'clojure.core/cond)]] ; Avoid reprocessing the cond with ns here
    (if pair
      (let [lhs-sexpr (api/sexpr lhs)]
        (clojure.core/cond
          (= 1 (count pair)) ;; better-cond allows single clause for default
          , (api/list-node (conj new-body (api/keyword-node :else) lhs))
          (better-cond-simple-keys lhs-sexpr) ;; Handle special better-cond constructs
          , (api/list-node
             (conj new-body
                   (api/keyword-node :else)
                   (api/list-node [(api/token-node (symbol #_"clojure.core" (name lhs-sexpr)))
                                   rhs
                                   (process-pairs pairs)])))
          (better-cond-complex-keys lhs-sexpr)  ;; Multi stage constructs
          , (api/list-node
             (conj new-body
                   (api/keyword-node :else)
                   (api/list-node [(api/token-node 'let)
                                   rhs
                                   (api/list-node [(api/token-node 'when)
                                                   (api/list-node    ;; ATTN: shortcut here; fine for linting
                                                    [(api/token-node 'every?)
                                                     (api/token-node (better-cond-complex-keys lhs-sexpr))
                                                     (api/vector-node (->> rhs
                                                                           api/sexpr
                                                                           extract-binding-forms
                                                                           (map api/token-node)))])
                                                   (process-pairs pairs)])])))
          :else
          , (recur pairs (conj new-body lhs rhs))))
      (api/list-node new-body))))

(defn cond-hook
  [{:keys [node]}]
  (let [expr (let [args (rest (:children node))
                   pairs (partition-all 2 args)]
               (process-pairs pairs))]
    {:node (with-meta expr
             (meta node))}))

(defn process-if-let-pairs [pairs then else]
  (if (seq pairs)
    (let [[lhs rhs] (first pairs)]
      (if (and (api/keyword-node? lhs)
               (= :let (api/sexpr lhs)))
        (api/list-node (conj [(api/token-node 'clojure.core/let) rhs
                              (process-if-let-pairs (next pairs) then else)]))
        (let [test (api/token-node (gensym "test"))]
          (api/list-node
           (conj [(api/token-node 'clojure.core/let) (api/vector-node [test rhs])
                  (api/list-node [(api/token-node 'if) test
                                  (api/list-node
                                   [(api/token-node 'clojure.core/let)
                                    (api/vector-node [lhs test])
                                    (process-if-let-pairs (next pairs) then else)])
                                  else])])))))
    then))

(defn if-let-hook
  [{:keys [node]}]
  (let [expr (let [[binding-vec then else] (rest (:children node))
                   pairs (partition-all 2 (:children binding-vec))
                   node (process-if-let-pairs pairs then else)]
               node)]
    {:node (with-meta expr
             (meta node))}))

(defn when-let-hook
  [{:keys [node]}]
  (let [expr (let [[binding-vec & body] (rest (:children node))]
               (api/list-node
                [(api/token-node 'better-cond.core/if-let)
                 binding-vec
                 (api/list-node (list* (api/token-node 'do)
                                       body))]))]
    {:node (with-meta expr
             (meta node))}))

(defn defnc-hook [{:keys [node]}]
  (let [[defnc-node name-node arg-node & body]
        (:children node)
        new-node (api/list-node [(api/token-node (if (str/ends-with? (str defnc-node)
                                                                     "defnc-")
                                                   'clojure.core/defn-
                                                   'clojure.core/defn))
                                 name-node
                                 arg-node
                                 (api/list-node
                                  (list* (api/token-node 'better-cond.core/cond)
                                         body))])]
    {:node new-node}))
