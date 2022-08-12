(ns hooks.toucan.util.test
  (:require [clj-kondo.hooks-api :as api]))

(defn- with-temp-inner [body bindings]
  (let [pairs       (partition 2 bindings)
        db-refs     (map first pairs)
        let-stream  (mapcat (fn [[_ bindings+opts]]
                              (let [children (:children bindings+opts)]
                                (if (= 1 (count children))
                                  (concat children [(api/map-node [])])
                                  children)))
                            pairs)]
    (api/vector-node [(api/vector-node db-refs)
                      (with-meta (api/list-node (list* (api/token-node `let)
                                                       (with-meta (api/vector-node let-stream)
                                                         (meta body))
                                                       body))
                        (meta body))])))

(defn with-temp [{:keys [node]}]
  (let [[_ db-ref binding+opts & body] (:children node)
        node (with-temp-inner body [db-ref binding+opts])]
    {:node node}))

(defn with-temp* [{:keys [node]}]
  (let [[_ bindings & body]  (:children node)]
    {:node (with-temp-inner body (:children bindings))}))
