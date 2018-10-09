(ns metabase.timeseries-query-processor-test.util
  "Utility functions and macros for testing timeseries database drivers, such as Druid."
  (:require [metabase.test.data :as data]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :as datasets]
             [interface :as i]]
            [metabase.util :as u]))

(def event-based-dbs
  #{:druid})

(def flattened-db-def
  "The normal test-data DB definition as a flattened, single-table DB definition. (This is a function rather than a
  straight delay because clojure complains when they delay gets embedding in expanded macros)"
  (delay (i/flatten-dbdef defs/test-data "checkins")))

;; force loading of the flattened db definitions for the DBs that need it
(defn- load-event-based-db-data!
  {:expectations-options :before-run}
  []
  (doseq [engine event-based-dbs]
    (datasets/with-engine-when-testing engine
      (data/do-with-temp-db @flattened-db-def (constantly nil)))))

(defn do-with-flattened-dbdef
  "Execute F with a flattened version of the test data DB as the current DB def."
  [f]
  (data/do-with-temp-db @flattened-db-def (u/drop-first-arg f)))

(defmacro with-flattened-dbdef
  "Execute BODY using the flattened test data DB definition."
  [& body]
  `(do-with-flattened-dbdef (fn [] ~@body)))

(defmacro expect-with-timeseries-dbs
  {:style/indent 0}
  [expected actual]
  `(datasets/expect-with-engines event-based-dbs
     (with-flattened-dbdef ~expected)
     (with-flattened-dbdef ~actual)))
