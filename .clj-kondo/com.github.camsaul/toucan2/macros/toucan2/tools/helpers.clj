(ns macros.toucan2.tools.helpers
  (:require [macros.toucan2.common :as common]))

(defmacro define-before-select [dispatch-value [args-binding] & body]
  `(do
     ~dispatch-value
     (fn [~(common/ignore-unused '&query-type)
          ~(common/ignore-unused '&model)
          ~args-binding]
       ~@body)))

(defmacro define-after-select [model [instance-binding] & body]
  `(do
     ~model
     (fn [~(common/ignore-unused '&query-type)
          ~(common/ignore-unused '&model)
          ~(common/ignore-unused '&parsed-args)
          ~instance-binding]
       ~@body)))

(defmacro define-before-delete
  [model [instance-binding] & body]
  `(do
     ~model
     (fn [~(common/ignore-unused '&model)
          ~instance-binding]
       ~@body)))
