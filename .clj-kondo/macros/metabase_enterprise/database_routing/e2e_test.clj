(ns macros.metabase-enterprise.database-routing.e2e-test)

(defmacro with-temp-dbs! [bindings & body]
  `(let [~@(interleave bindings (repeat nil))]
     ~@body))
