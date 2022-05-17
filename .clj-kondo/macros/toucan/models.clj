(ns macros.toucan.models)

(defmacro defmodel [model-name & _args]
  `(do
     (def ~model-name)
     (defrecord ~(symbol (str model-name "Instance")) [])))
