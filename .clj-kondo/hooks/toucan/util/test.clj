(ns hooks.toucan.util.test
  (:require [clj-kondo.hooks-api :as api]))

(defn- with-temp-inner [body bindings]
  (let [binding-infos (for [[model {[binding value] :children}] (partition 2 bindings)]
                        {:model   model
                         :binding binding
                         :value   (or value
                                      (api/token-node 'nil))})]
    (-> (api/vector-node
         [(api/vector-node (map :model binding-infos))
          (-> (api/list-node (list* (api/token-node `let)
                                    (api/vector-node (mapcat (juxt :binding :value) binding-infos))
                                    body))
              (with-meta (meta body)))])
        (with-meta (meta body)))))

(defn with-temp* [{:keys [node]}]
  (let [[_ bindings & body] (:children node)]
    {:node (with-temp-inner body (:children bindings))}))
