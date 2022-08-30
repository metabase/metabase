(ns macros.metabase-enterprise.advanced-permissions.models.permissions.application-permissions-test)

(defmacro with-new-group-and-current-graph
  [group-id-binding current-graph-binding & body]
  `(let [~group-id-binding      {}
         ~current-graph-binding {}]
     ~@body))
