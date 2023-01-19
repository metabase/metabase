(ns macros.toucan2.execute)

(defmacro with-call-count
  [[call-count-fn-binding] & body]
  `(let [~call-count-fn-binding (fn [])]
     ~@body))
