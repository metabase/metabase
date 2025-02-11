(ns macros.metabase.model-persistence.test-util)

(defmacro with-persistence-enabled! [[persist-fn-sym] & body]
  `(clojure.core/let [~persist-fn-sym (fn [])]
     ~@body))
