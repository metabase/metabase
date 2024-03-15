(ns metabase.timeseries-query-processor-test.util
  "Utility functions and macros for testing timeseries database drivers, such as Druid."
  (:require
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]))

(defn timeseries-drivers []
  #{:druid :druid-jdbc})

(def flattened-db-def
  "The normal test-data DB definition as a flattened, single-table DB definition."
  (tx/flattened-dataset-definition defs/test-data "checkins"))

(defn do-with-flattened-dbdef
  "Execute `f` with a flattened version of the test data DB as the current DB def."
  [f]
  (mt/dataset flattened-db-def (f)))

(defmacro with-flattened-dbdef
  "Execute `body` using the flattened test data DB definition."
  [& body]
  `(do-with-flattened-dbdef (fn [] ~@body)))

(defn- time->timestamp-col [col]
  (cond-> col
    (= "__time" (:name col))
    (-> col
        (assoc :name "timestamp")
        (assoc :display_name "Timestamp"))))

(defn adjust-result-cols
  [result]
  (as-> result r
    (if (-> r :data :cols seq)
      (update-in r [:data :cols] (partial map time->timestamp-col))
      r)
    (if (-> r :data :results_metadata :columns seq)
      (update-in r [:data :results_metadata :columns] (partial mapv time->timestamp-col))
      r)))

(defn do-test-timeseries-drivers [thunk]
  (binding [data/*run-post-process-fn* adjust-result-cols]
    (mt/test-drivers (timeseries-drivers)
      (with-flattened-dbdef
        (thunk)))))

(defmacro test-timeseries-drivers {:style/indent 0} [& body]
  `(do-test-timeseries-drivers (fn [] ~@body)))
