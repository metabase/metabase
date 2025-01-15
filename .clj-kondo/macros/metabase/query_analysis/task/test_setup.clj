(ns macros.metabase.query-analysis.task.test-setup
  (:require [macros.common]))

(defmacro with-test-setup!
  "Set up the data required to test the Query Analysis related tasks"
  [& body]
  `(let [~(macros.common/ignore-unused 'c1) 1
         ~(macros.common/ignore-unused 'c2) 2
         ~(macros.common/ignore-unused 'c3) 3
         ~(macros.common/ignore-unused 'c4) 4
         ~(macros.common/ignore-unused 'archived) 5
         ~(macros.common/ignore-unused 'invalid) 6]
     ~@body))
