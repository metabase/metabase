(ns hooks.metabase.channel.template.handlebars-helper
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]))

(defn defhelper
  "defhelper hook"
  [{:keys [node]}]
  (let [[_ helper-name description argvec & body] (:children node)
        helper-fn-name (symbol (str (hooks/sexpr helper-name) "*"))]
    {:node (-> (hooks/list-node
                (list (hooks/token-node 'do)
                      (hooks/list-node
                       (list (hooks/token-node 'defn)
                             (hooks/token-node helper-fn-name)
                             description
                             argvec
                             (hooks/list-node body)))
                      (hooks/list-node
                       (list (hooks/token-node 'defn)
                             helper-name
                             description
                             argvec
                             (hooks/list-node body)))))
               (with-meta (meta node)))}))
