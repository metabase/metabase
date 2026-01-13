(ns macros.metabase.server.statistics-handler-test)

(defmacro with-server
  [[hold-chan hit-chan] & body]
  `(let [~hold-chan nil
         ~hit-chan  nil]
     ~@body))
