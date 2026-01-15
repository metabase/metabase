(ns macros.metabase.server.statistics-handler-test)

(defmacro with-server
  [[_hold-chan _hit-chan] & body]
  `(let []
     ~@body))
