(ns hooks.metabase.test.util
  (:require [clj-kondo.hooks-api :as hooks]
            [hooks.common :as common]))

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
  [{:keys [node]}]
  (let [{[_ bindings & body] :children} node
        bindings (if (hooks/vector-node? bindings)
                   (hooks/vector-node (into []
                                            (mapcat (fn [[setting-name v]]
                                                      (concat
                                                        [(with-meta (hooks/token-node '_) (meta setting-name)) v]
                                                        ;; if the setting name is namespace-qualified add a `_`
                                                        ;; entry for it too.
                                                        (when (namespaced-symbol-node? setting-name)
                                                          [(with-meta (hooks/token-node '_) (meta setting-name)) setting-name]))))
                                            (partition 2 (:children bindings))))
                   bindings)]
    {:node (-> (list*
                (hooks/token-node 'let)
                bindings
                body)
               (with-meta (meta body))
               hooks/list-node
               (with-meta (meta body)))}))

(defn with-temp-file
  [{{[_ {bindings :children} & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 (into []
                       (comp (partition-all 2)
                             (mapcat (fn [[binding filename]]
                                       [binding (or (when (and filename
                                                               (not (nil? (hooks/sexpr filename))))
                                                      filename)
                                                    (hooks/string-node "filename"))])))
                       bindings))
                body))]
    {:node node*}))
