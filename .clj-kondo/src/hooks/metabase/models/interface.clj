(ns hooks.metabase.models.interface
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]))

(defn define-hydration-method
  "This is used for both [[metabase.models.interface/define-simple-hydration-method]] and
  for [[metabase.models.interface/define-batched-hydration-method]]."
  [{{[_define-simple-hydration-method fn-name hydration-key & fn-tail] :children, :as node} :node}]
  (let [node (-> (hooks/list-node
                  (list
                   (hooks/token-node 'do)
                   hydration-key
                   (hooks/list-node
                    (list*
                     (hooks/token-node 'defn)
                     fn-name
                     fn-tail))))
                 (with-meta (meta node))
                 hooks.common/add-lsp-ignore-unused-public-var-metadata)]
    {:node node}))
