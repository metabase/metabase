(ns hooks.metabase.app-db.schema-migrations-test.impl
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn- validate-mb-app-db-migrations-test!
  "CI runs the namespaces tagged `:mb/app-db-migrations-test` on a shard of their own, because a count-based split
  can't balance them (see `.github/workflows/app-db.yml`). An untagged one still runs, just on a shard sized for
  everything else."
  [{:keys [ns node]}]
  (when-not (:mb/app-db-migrations-test (meta ns))
    (hooks/reg-finding!
     (assoc (meta node)
            :message (str "Namespaces that run migration tests (test-migrations) should be marked"
                          " ^:mb/app-db-migrations-test [:metabase/validate-mb-app-db-migrations-test]")
            :type :metabase/validate-mb-app-db-migrations-test))))

(defn test-migrations!
  [{{[_ migration-range {[binding] :children} & body] :children} :node, :as x}]
  (validate-mb-app-db-migrations-test! x)
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node `let)
                (hooks/vector-node
                 [binding (hooks/list-node (list (hooks/token-node `fn)
                                                 (hooks/vector-node [(hooks/token-node '&) (hooks/token-node '_args)])))])
                migration-range
                body))]
    {:node node*}))
