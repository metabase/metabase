(ns macros.metabase.api.card-test
  (:require [macros.common]))

(defmacro with-ordered-items
  [collection model-and-name-syms & body]
  `(let ~(into []
               (comp (partition-all 2)
                     (mapcat (fn [[model binding]]
                               [(macros.common/ignore-unused binding) model])))
               model-and-name-syms)
     ~collection
     ~@body))
