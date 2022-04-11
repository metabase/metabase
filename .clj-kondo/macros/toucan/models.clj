(ns toucan.models)

(defmacro defmodel [model-name & ks]
  `(do (clojure.core/defrecord ~model-name ~(vec (map (comp symbol name) ks)))
       (clojure.core/defrecord
           ~(symbol (str model-name "Instance"))
           ~(vec (map (comp symbol name) ks)))
       ~(symbol (str model-name "Instance"))))
