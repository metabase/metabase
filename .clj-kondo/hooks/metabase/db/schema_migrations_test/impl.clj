(ns hooks.metabase.db.schema-migrations-test.impl
  (:require [clj-kondo.hooks-api :as hooks]))

(defn test-migrations
  [{{[_ migration-range {[binding] :children} & body] :children} :node}]
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node `let)
                (hooks/vector-node
                 [binding (hooks/list-node (list (hooks/token-node `fn)
                                                 (hooks/vector-node [])))])
                migration-range
                body))]
    {:node node*}))
