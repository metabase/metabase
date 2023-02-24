(ns macros.toucan2.tools.before-insert
  (:require [macros.toucan2.common :as common]))

(defmacro define-before-insert
  [model [instance-binding] & body]
  `(do
     ~model
     (fn [~(common/ignore-unused '&model)
          ~instance-binding]
       ~@body)))
