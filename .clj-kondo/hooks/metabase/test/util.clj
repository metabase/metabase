(ns hooks.metabase.test.util
  (:require [clj-kondo.hooks-api :as hooks]))

(defn with-temporary-setting-values
  "Rewrite a form like

    (with-temporary-setting-values [x 1, y 2]
      ...)

  as one like

    (let [_ 1, _ 2]
      ...)

  for analysis purposes."
  [{:keys [node]}]
  (let [[bindings & body] (rest (:children node))
        bindings          (if (hooks/vector-node? bindings)
                            (hooks/vector-node (into []
                                                     (mapcat (fn [[_token-name v]]
                                                               [(hooks/token-node '_) v]))
                                                     (partition 2 (:children bindings))))
                            bindings)]
    {:node (-> (list*
                (hooks/token-node 'let)
                bindings
                body)
               (with-meta (meta body))
               hooks/list-node
               (with-meta (meta body)))}))
