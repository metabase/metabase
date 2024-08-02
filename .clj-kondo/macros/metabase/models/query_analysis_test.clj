(ns macros.metabase.models.query-analysis-test
  (:require [macros.common]))

(defmacro with-test-setup [& body]
  `(let [~(macros.common/ignore-unused 'card-id)  1
         ~(macros.common/ignore-unused 'table-id) 2
         ~(macros.common/ignore-unused 'tax-id)   3
         ~(macros.common/ignore-unused 'total-id) 4]
     ~@body))
