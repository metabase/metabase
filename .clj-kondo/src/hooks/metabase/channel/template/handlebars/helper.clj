(ns hooks.metabase.channel.template.handlebars.helper
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]))

#_(defn defhelper
    [{{[_ fn-name _description argvec & fn-tail] :children} :node}]
    (def fn-tail fn-tail)
    {:node (hooks/list-node
            (list*
             (hooks/token-node 'let)
             (hooks/vector-node
              [(first (:children argvec)) (hooks/token-node 'nil)
               (second (:children argvec)) (hooks/token-node 'nil)])
             fn-tail))})

(defn defhelper
  [{{[_ fn-name & fn-tail] :children} :node}]
  {:node (hooks/list-node
          (list*
           (hooks/token-node 'defn)
           fn-tail))})

(comment
  (defn debug-hook
    [hook form]
    (println
     (str
      (:node
       (hook
        {:node
         (hooks/parse-string
          (str form))})))))
  (debug-hook defhelper
    '(defhelper ifequals
       "If equals helper.

       {{#ifequals name \"hotdog\"}}
       Hotdog
       {{else}}
       Not a hotdog
       {{/ifequals}}"
       [arg options]
       (let [x arg
             y (option-param options 0)]
         (if (= x y)
           (option-block-body options)
           (option-else-block options))))))

(defn with-bound [{:keys [node]}]
  (let [[binding-vec & body] (rest (:children node))
        [sym val opts] (:children binding-vec)]
    (when-not (and sym val)
      (throw (ex-info "No sym and val provided" {})))
    (let [new-node (hooks/list-node
                    (list*
                     (hooks/token-node 'let)
                     (hooks/vector-node [sym val])
                     opts
                     body))]
      {:node new-node})))

(debug-hook with-bound
  '(with-bound [a 1 {:b 2}]
     (println a b)))

(println (str (hooks/parse-string
               (str '(defn add "add" [a b] (+ a b))))))

(def node (api/parse-string "(+ 1 2 3)"))
