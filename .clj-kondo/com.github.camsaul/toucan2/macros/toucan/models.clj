(ns macros.toucan.models)

(defmacro defmodel
  [model _table-name]
  `(def ~model "Docstring." ~(keyword (name model))))
