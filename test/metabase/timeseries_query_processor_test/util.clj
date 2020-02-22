(ns metabase.timeseries-query-processor-test.util
  "Utility functions and macros for testing timeseries database drivers, such as Druid."
  (:require [metabase.test.data :as data]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :as datasets]
             [interface :as tx]]))

(defn timeseries-drivers []
  #{:druid})

(def ^:private flattened-db-def
  "The normal test-data DB definition as a flattened, single-table DB definition."
  (tx/flattened-dataset-definition defs/test-data "checkins"))

(defn do-with-flattened-dbdef
  "Execute `f` with a flattened version of the test data DB as the current DB def."
  [f]
  (data/dataset flattened-db-def (f)))

(defmacro with-flattened-dbdef
  "Execute `body` using the flattened test data DB definition."
  [& body]
  `(do-with-flattened-dbdef (fn [] ~@body)))

(defmacro ^:deprecated expect-with-timeseries-dbs
  "DEPRECATED: Prefer

    (deftest my-test
      (mt/with-drivers (timeseries-drivers)
        (with-flattened-dbdef
          ...)))"
  {:style/indent 0}
  [expected actual]
  `(datasets/expect-with-drivers (timeseries-drivers)
     (with-flattened-dbdef ~expected)
     (with-flattened-dbdef ~actual)))
