(ns macros.toucan2.tools.default-fields
  (:require [macros.toucan2.common :as common]))

(defmacro define-default-fields [model & body]
  `(let [~(common/ignore-unused '&model) ~model]
     ~@body))
