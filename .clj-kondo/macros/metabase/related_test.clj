(ns macros.metabase.related-test
  (:require [macros.common]))

(defmacro with-world [& body]
  `(let [~(macros.common/ignore-unused 'collection-id) nil
         ~(macros.common/ignore-unused 'metric-id-a) nil
         ~(macros.common/ignore-unused 'metric-id-b) nil
         ~(macros.common/ignore-unused 'segment-id-a) nil
         ~(macros.common/ignore-unused 'segment-id-b) nil
         ~(macros.common/ignore-unused 'card-id-a) nil
         ~(macros.common/ignore-unused 'card-id-b) nil
         ~(macros.common/ignore-unused 'card-id-c) nil]
     ~@body))
