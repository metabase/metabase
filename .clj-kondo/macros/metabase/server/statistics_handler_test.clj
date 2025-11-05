(ns macros.metabase.server.statistics-handler-test)

(defmacro with-server
  [_ _ [connector chan-start-handle chan-finish-handle chan-done-request] & body]
  `(let [~connector          nil
         ~chan-start-handle  nil
         ~chan-finish-handle nil
         ~chan-done-request  nil]
     ~@body))
