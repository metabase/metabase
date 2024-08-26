(ns macros.metabase-enterprise.query-reference-validation.api-test
  (:require [macros.common]))

(defmacro with-test-setup! [& body]
  `(let [~(macros.common/ignore-unused 'card-1) 1
         ~(macros.common/ignore-unused 'card-2) 2
         ~(macros.common/ignore-unused 'card-3) 3
         ~(macros.common/ignore-unused 'card-4) 4
         ~(macros.common/ignore-unused 'card-5) 5
         ~(macros.common/ignore-unused 'coll-2) 100
         ~(macros.common/ignore-unused 'coll-3) 200]
     ~@body))
