(ns metabase.timeseries-query-processor-test.util
  "Utility functions and macros for testing timeseries database drivers, such as Druid."
  (:require [metabase.test.data :as data]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :as datasets]
             [interface :as tx]]))

(def event-based-dbs
  #{:druid})

(def ^:private flattened-db-def
  "The normal test-data DB definition as a flattened, single-table DB definition."
  (tx/flattened-dataset-definition defs/test-data "checkins"))

;; force loading of the flattened db definitions for the DBs that need it
(defn- load-event-based-db-data!
  {:expectations-options :before-run}
  []
  (doseq [driver event-based-dbs]
    (datasets/with-driver-when-testing driver
      (data/do-with-db-for-dataset flattened-db-def (constantly nil)))))

(defn do-with-flattened-dbdef
  "Execute `f` with a flattened version of the test data DB as the current DB def."
  [f]
  (data/do-with-db-for-dataset flattened-db-def (fn [_] (f))))

(defmacro with-flattened-dbdef
  "Execute `body` using the flattened test data DB definition."
  [& body]
  `(do-with-flattened-dbdef (fn [] ~@body)))

(defmacro expect-with-timeseries-dbs
  {:style/indent 0}
  [expected actual]
  `(datasets/expect-with-drivers event-based-dbs
     (with-flattened-dbdef ~expected)
     (with-flattened-dbdef ~actual)))
