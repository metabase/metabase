(ns hooks.metabase.metabot-v3.tools.interface
  (:require
   [clj-kondo.hooks-api :as api]
   [hooks.metabase.metabot-v3.tools.interface :as metabase.metabot-v3.tools.interface]))

(defn deftool [x]
  (letfn [(tool-definition-method-node [{[_deftool tool-name description parameters] :children}]
            (api/list-node
             (list
              (api/token-node 'clojure.core/defmethod)
              (api/token-node 'metabase.metabot-v3.tools.interface/tool-definition)
              (api/reg-keyword! tool-name 'metabase.metabot-v3.tools.interface/deftool)
              (api/vector-node [(api/token-node '_tool-name)])
              (api/map-node [(api/keyword-node :description) description
                             (api/keyword-node :parameters)  parameters]))))
          (invoke-tool-method-node [{[_deftool tool-name _description _parameters bindings & body] :children}]
            (api/list-node
             (list*
              (api/token-node 'clojure.core/defmethod)
              (api/token-node 'metabase.metabot-v3.tools.interface/invoke-tool)
              tool-name
              (-> (api/vector-node (into [(api/token-node '_tool-name)] (:children bindings)))
                  (with-meta (meta bindings)))
              body)))
          (update-node [node]
            (-> (api/list-node
                 (list
                  (api/token-node 'do)
                  (tool-definition-method-node node)
                  (invoke-tool-method-node node)))
                (with-meta (meta node))))]
    (update x :node update-node)))
