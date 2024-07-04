(ns macros.metabase-enterprise.query-field-validation.api-test
  (:require [macros.common]))

(defmacro with-test-setup [& body]
  `(let [~(macros.common/ignore-unused 'card-1) 1
         ~(macros.common/ignore-unused 'card-2) 2
         ~(macros.common/ignore-unused 'card-3) 3
         ~(macros.common/ignore-unused 'card-4) 4
         ~(macros.common/ignore-unused 'qf-1) 10
         ~(macros.common/ignore-unused 'qf-2) 20]
     ~@body))
