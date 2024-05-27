(ns macros.metabase-enterprise.advanced-permissions.api.util-test
  (:require [macros.common]))

(defmacro with-impersonations! [impersonations-and-attributes-map & body]
  `(let [~(macros.common/ignore-unused '&group) ~impersonations-and-attributes-map]
     ~@body))
