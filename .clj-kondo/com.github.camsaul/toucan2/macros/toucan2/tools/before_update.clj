(ns macros.toucan2.tools.before-update
  (:require [macros.toucan2.common :as common]))

(defmacro define-before-update
  [model [instance-binding] & body]
  `(do
     ~model
     (fn [~(common/ignore-unused '&model)
          ~instance-binding]
       ~@body)))
