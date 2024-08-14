(ns macros.metabase-enterprise.sandbox.test-util
  (:require [macros.common]))

(defmacro with-gtaps! [gtaps-definition & body]
  `(let [~(macros.common/ignore-unused '&group) ~gtaps-definition]
     ~@body))
