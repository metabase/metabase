(ns macros.metabase-enterprise.database-routing.e2e-test)

(defmacro with-temp-dbs! [bindings & body]
  `(let [~@(interleave bindings (repeat nil))]
     ~@body))

(defmacro with-routing-setup! [[router-binding destinations] & body]
  `(let [~router-binding nil
         ~@(interleave (map first destinations) (repeat nil))]
     ~@body))
