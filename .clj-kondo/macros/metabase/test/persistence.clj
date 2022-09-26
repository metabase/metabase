(ns macros.metabase.test.persistence)

(defmacro with-persistence-enabled [[persist-fn-sym] & body]
  `(clojure.core/let [~persist-fn-sym (fn [])]
     ~@body))
