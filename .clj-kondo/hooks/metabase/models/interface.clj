(ns hooks.metabase.models.interface
  (:require [clj-kondo.hooks-api :as hooks]))

(defn define-hydration-method
  "This is used for both [[metabase.models.interface/define-simple-hydration-method]] and
  for [[metabase.models.interface/define-batched-hydration-method]]."
  [{{[_define-simple-hydration-method fn-name hydration-key & fn-tail] :children} :node}]
  (let [node (hooks/list-node
              (list
               (hooks/token-node 'do)
               hydration-key
               (hooks/list-node
                (list*
                 (hooks/token-node 'defn)
                 fn-name
                 fn-tail))))]
    {:node node}))
