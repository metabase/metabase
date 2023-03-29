(ns macros.toucan2.tools.after-update
  (:require [macros.toucan2.common :as common]))

(defmacro define-after-update
  [model [instance-binding] & body]
  `(do
     ~model
     (fn [~(common/ignore-unused '&model)
          ~instance-binding]
       ~@body)))
