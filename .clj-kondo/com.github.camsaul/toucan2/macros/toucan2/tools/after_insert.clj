(ns macros.toucan2.tools.after-insert
  (:require [macros.toucan2.common :as common]))

(defmacro define-after-insert
  [model [instance-binding] & body]
  `(do
     ~model
     (fn [~(common/ignore-unused '&model)
          ~instance-binding]
       ~@body)))
