(ns macros.metabase.api.collection-test
  (:require [macros.common]))

(defmacro with-collection-hierarchy [bindings & body]
  `(let [~(macros.common/ignore-unused 'a) nil
         ~(macros.common/ignore-unused 'b) nil
         ~(macros.common/ignore-unused 'c) nil
         ~(macros.common/ignore-unused 'd) nil
         ~(macros.common/ignore-unused 'e) nil
         ~(macros.common/ignore-unused 'f) nil
         ~(macros.common/ignore-unused 'g) nil]
     ~bindings
     ~@body))

(defmacro with-some-children-of-collection [collection-or-id-or-nil & body]
  `(let [~(macros.common/ignore-unused '&ids) ~collection-or-id-or-nil]
     ~@body))
