(ns metabase.timeseries-query-processor-test.util
  "Utility functions and macros for testing timeseries database drivers, such as Druid."
  (:require
   [metabase.test :as mt]))

(defn timeseries-drivers []
  #{:druid})

(defn do-with-flattened-dbdef
  "Execute `f` with a flattened version of the test data DB as the current DB def."
  [thunk]
  (mt/dataset flattened-db-def (thunk)))

(defmacro with-flattened-dbdef
  "Execute `body` using the flattened test data DB definition."
  [& body]
  `(do-with-flattened-dbdef (fn [] ~@body)))

(defn do-test-timeseries-drivers [thunk]
  (mt/test-drivers (timeseries-drivers)
    (with-flattened-dbdef
      (thunk))))

(defmacro test-timeseries-drivers {:style/indent 0} [& body]
  `(do-test-timeseries-drivers (fn [] ~@body)))
