(ns hooks.toucan2.tools.simple-out-transform
  (:require [clj-kondo.hooks-api :as hooks]))

(defn- ignore-unused-binding [x]
  (vary-meta x assoc :clj-kondo/ignore [:unused-binding]))

(defn define-out-transform
  [{{[_define-out-transform dispatch-value {[instance-binding] :children, :as bindings} & body] :children, :as node} :node}]
  {:node (-> (hooks/list-node
              [(hooks/token-node 'do)
               dispatch-value
               (hooks/list-node
                (list*
                 (hooks/token-node 'fn)
                 (-> (hooks/vector-node
                      [(ignore-unused-binding (with-meta (hooks/token-node '&query-type)  (meta bindings)))
                       (ignore-unused-binding (with-meta (hooks/token-node '&model)       (meta bindings)))
                       instance-binding])
                     (with-meta (meta bindings)))
                 body))])
             (with-meta (meta node)))})

(comment
  (defn test-define-out-transform []
    (as-> '(tools.simple-out-transform/define-out-transform [:toucan.query-type/select.instances ::after-select]
             [instance]
             (let [wow 1000]
               ;; don't do after-select if this select is a result of doing something like insert-returning instances
               (if (isa? &query-type :toucan2.pipeline/select.instances-from-pks)
                 instance
                 (after-select instance)))) <>
        (hooks/parse-string (pr-str <>))
        (define-out-transform {:node <>})
        (:node <>)
        (hooks/sexpr <>)
        (binding [*print-meta* false #_true]
          (clojure.pprint/pprint <>)))))
