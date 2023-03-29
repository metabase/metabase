(ns macros.methodical.impl.combo.operator)

;; not exactly what actually happens but this is close enough to be able to lint it
(defmacro defoperator [operator-name [methods-binding invoke-binding] & body]
  `(defmethod methodical.impl.combo.operator/operator ~(keyword operator-name)
     [~methods-binding ~invoke-binding]
     ~@body))
