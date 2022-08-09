(ns hooks.toucan.util.test
  (:require [clj-kondo.hooks-api :as api]))

(defn- with-temp-inner [body bindings]
  (let [pairs       (partition 2 bindings)
        db-refs     (map first pairs)
        let-stream  (for [[_ binding+opts] pairs
                          ;; if children is size 1 then ensure nil is on the right side of the let
                          :let [[binding-part opts] (:children binding+opts)]
                          part [binding-part opts]]
                      part)]
    (api/vector-node [(api/vector-node db-refs)
                      (api/list-node (list* (api/token-node `let)
                                            (api/vector-node let-stream)
                                            body))])))

(defn with-temp [{:keys [node]}]
  (let [[_ db-ref binding+opts & body] (:children node)]
    {:node (with-temp-inner body [db-ref binding+opts])}))

(defn with-temp* [{:keys [node]}]
  (let [[_ bindings & body]  (:children node)]
    {:node (with-temp-inner body (:children bindings))}))
