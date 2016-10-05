(ns metabase.query-processor-test.util
  "Utility functions and constants for testing the query processor."
  (:require [clojure.set :as set]
            [metabase.driver :as driver]
            [metabase.test.data.datasets :as datasets]
            [metabase.util :as u]))


;;; ------------------------------------------------------------ ENGINE SETS ------------------------------------------------------------

(def ^:const timeseries-engines
  "Set of timeseries DB engines. These are tested in `metabase.timeseries-query-processor-test` instead of `metabase.query-processor-test`."
  #{:druid})

(defn timeseries-engines-that-support
  "Set of timeeries engines that support a given FEATURE."
  [feature]
  (set (for [engine timeseries-engines
             :when  (contains? (driver/features (driver/engine->driver engine)) feature)]
         engine)))

(def ^:const non-timeseries-engines
  "Set of engines for non-timeseries DBs (i.e., every driver except `:druid`)."
  (set/difference datasets/all-valid-engines timeseries-engines))

(defn engines-that-support
  "Set of non-timeseries engines that support a given FEATURE."
  [feature]
  (set (for [engine non-timeseries-engines
             :when  (contains? (driver/features (driver/engine->driver engine)) feature)]
         engine)))

(defn engines-that-dont-support
  "Set on non-timeseries engines that do *not* support FEATURE."
  [feature]
  (set/difference non-timeseries-engines (engines-that-support feature)))


;;; ------------------------------------------------------------ RESULTS ------------------------------------------------------------


(defn format-rows-by
  "Format the values in result ROWS with the fns at the corresponding indecies in FORMAT-FNS.
   ROWS can be a sequence or any of the common map formats we expect in QP tests.

     (format-rows-by [int str double] [[1 1 1]]) -> [[1 \"1\" 1.0]]

   By default, does't call fns on `nil` values; pass a truthy value as optional param FORMAT-NIL-VALUES? to override this behavior."
  {:style/indent 1}
  ([format-fns rows]
   (format-rows-by format-fns (not :format-nil-values?) rows))
  ([format-fns format-nil-values? rows]
   (cond
     (= (:status rows) :failed) (throw (ex-info (:error rows) rows))

     (:data rows) (update-in rows [:data :rows] (partial format-rows-by format-fns))
     (:rows rows) (update    rows :rows         (partial format-rows-by format-fns))
     :else        (vec (for [row rows]
                         (vec (for [[f v] (partition 2 (interleave format-fns row))]
                                (when (or v format-nil-values?)
                                  (try (f v)
                                       (catch Throwable e
                                         (printf "(%s %s) failed: %s" f v (.getMessage e))
                                         (throw e)))))))))))

(defn data
  "Return the result `:data` (`:rows` and `:columns` from the query results, or throw an exception if they're missing."
  {:style/indent 0}
  [results]
  (when-let [data (or (:data results)
                      (println (u/pprint-to-str 'red results))
                      (throw (Exception. "Error!")))]
    (-> data
        (select-keys [:columns :rows])
        (update :rows vec))))

(defn rows
  "Return the result `:rows` from query results, or throw an exception if they're missing."
  {:style/indent 0}
  [results]
  (vec (or (-> results :data :rows)
           (println (u/pprint-to-str 'red results))
           (throw (Exception. "Error!")))))

(defn first-row
  "Return the first row in the results of a query, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  (first (rows results)))
