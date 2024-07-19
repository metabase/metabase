(ns dev.toucan2-monitor
  "Utilities to track and monitor queries made by toucan2.

  Usage:
    (start!) ;; start tracking
    ;; do some query using toucan 2 or via UI
    (queries) ;; get all queries and its execution time
    ;; => [[[\"SELECT * FROM report_card\"] 100]]
    (stop!)"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [dev.util :as dev.u]
   [metabase.test.util.log :as tu.log]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.io File)))


(set! *warn-on-reflection* true)

(def queries*
  "An atom to store all the queries and its execution time."
  (atom []))


(def ^:private log-future (atom nil))

(defn queries
  "Get all the queries and its execution time in ms.

  Usage:
    (queries)
    ;; => [[[\"SELECT * FROM report_card\"] 100]]"
  []
  @queries*)

(defn reset-queries!
  "Reset all the queries and its execution time."
  []
  (reset! queries* []))

(defn summary
  "Get the total number of queries and total execution time in ms."
  []
  (let [qs (queries)]
    {:total-queries           (count qs)
     :total-execution-time-ms (->> qs (map second) (apply +) int)}))

(defn- track-query-execution-fn
  [next-method rf conn query-type model query]
  (let [start  (System/nanoTime)
        result (next-method rf conn query-type model query)
        end    (System/nanoTime)]
    (swap! queries* (fnil conj []) [query (/ (- end start) 1e6)])
   result))


(defn start!
  "Start tracking queries."
  []
  (tu.log/set-ns-log-level! *ns* :debug)
  (when-let [f @log-future]
    (future-cancel f))
  (reset! log-future (future
                      (while true
                        (let [{:keys [total-queries total-execution-time-ms]} (summary)]
                          (log/infof "Total queries: %d, Total execution time: %dms" total-queries total-execution-time-ms)
                          (Thread/sleep 1000)))))
  (methodical/add-aux-method-with-unique-key!
   #'t2.pipeline/transduce-execute-with-connection
   :around
   :default
   track-query-execution-fn
   ::monitor))

(defn stop!
  "Stop tracking queries."
  []
  (future-cancel @log-future)
  (methodical/remove-aux-method-with-unique-key!
   #'t2.pipeline/transduce-execute-with-connection
   :around
   :default
   ::monitor))

(defn to-csv!
  "Save all the queries and its execution time to a csv file with 3 columns: query, params, execution time."
  []
  (let [qs        (queries)
        format-q  (fn [[q t]]
                    [(-> q first #_mdb.query/format-sql) (-> q rest vec) t])
        temp-file (File/createTempFile "queries" ".csv")]
    (with-open [w (io/writer temp-file)]
      (csv/write-csv w (cons ["query" "params" "execution-time(ms)"] (map format-q qs))))
    (dev.u/os-open temp-file)))

(comment
 (start!)
 (queries)
 (stop!)
 (reset-queries!)
 (summary)
 (to-csv!)
 (doseq [q (querles)]
   (println q)))
