(ns dev.toucan2-monitor
  "Utilities to track and monitor queries made by toucan2.

  Usage:
    (start!) ;; start tracking
    ;; do some query using toucan 2 or via UI
    (queries) ;; get all queries and its execution time
    ;; => [[[\"SELECT * FROM report_card\"] 100]]
    (stop!)"
  (:require
   [metabase.test.util.log :as tu.log]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.pipeline :as t2.pipeline]))

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
    {:total-queries (count qs)
     :total-execution-time (->> qs (map second) (apply +))}))

(defn- track-query-execution-fn
  [next-method rf conn query-type model query]
  (let [start (System/currentTimeMillis)
        result (next-method rf conn query-type model query)
        end (System/currentTimeMillis)]
    (swap! queries* (fnil conj []) [query (- end start)])
    result))

(defn start!
  "Start tracking queries."
  []
  (tu.log/set-ns-log-level! *ns* :debug)
  (reset! log-future (future
                      (while true
                        (let [{:keys [total-queries total-execution-time]} (summary)]
                          (log/infof "Total queries: %d, Total execution time: %dms" total-queries total-execution-time)
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

(comment
 (start!)
 (queries)
 (stop!)
 (reset-queries!)
 (summary)
 (doseq [q (querles)]
   (println q)))
