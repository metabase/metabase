(ns hooks.metabase.driver.mongo-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]))

(defn with-describe-table-for-sample
  "Forward bindings for results of functions used in mongo's describe-table implementation."
  [{{[_ _ & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node
                 [(hooks/token-node 'dbfields)      (hooks/token-node '(delay nil))
                  (hooks/token-node 'ftree)         (hooks/token-node '(delay nil))
                  (hooks/token-node 'nested-fields) (hooks/token-node '(delay nil))])
                body))]
    ;; Avoid warnings when not all from the dbfields, ftree and nested-fields are used.
    {:node (hooks.common/update-ignored-linters node* conj :unused-binding)}))
