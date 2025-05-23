(ns macros.metabase-enterprise.sandbox.test-util)

(defmacro with-gtaps! [gtaps-definition & body]
  `(let [~'&group ~gtaps-definition]
     ~'&group
     ~@body))
