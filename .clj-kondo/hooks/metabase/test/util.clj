(ns hooks.metabase.test.util
  (:require [clj-kondo.hooks-api :as hooks]))

(defn- namespaced-symbol-node? [node]
  (when (hooks/token-node? node)
    (let [symb (hooks/sexpr node)]
      (and (symbol? symb)
           (namespace symb)))))

(defn with-temporary-setting-values
  "Rewrite a form like

    (with-temporary-setting-values [x 1, some.ns/y 2]
      ...)

  as one like

    (let [_ 1, _ some.ns/y, _ 2]
      ...)

  for analysis purposes. We only need to 'capture' namespaced Setting bindings with a `_` so Kondo considers their
  namespace to be 'used' and to catch undefined var usage."
  [{{[_ bindings & body] :children} :node}]
  (let [bindings (if (hooks/vector-node? bindings)
                   (hooks/vector-node (into []
                                            (mapcat (fn [[setting-name v]]
                                                      (concat
                                                       [(hooks/token-node '_) v]
                                                       ;; if the setting name is namespace-qualified add a `_`
                                                       ;; entry for it too.
                                                       (when (namespaced-symbol-node? setting-name)
                                                         [(hooks/token-node '_) setting-name]))))
                                            (partition 2 (:children bindings))))
                   bindings)]
    {:node (-> (list*
                (hooks/token-node 'let)
                bindings
                body)
               (with-meta (meta body))
               hooks/list-node
               (with-meta (meta body)))}))
