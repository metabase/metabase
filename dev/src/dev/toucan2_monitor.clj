(ns dev.toucan2-monitor
  "Utilities to track and monitor queries made by toucan2.

  Usage:
    (start!) ;; start tracking
    ;; do some query using toucan 2 or via UI
    (queries) ;; get all queries and its execution time
    ;; => [[[\"SELECT * FROM report_card\"] 100]]
    (stop!)
    (to-csv!)
    ;; to save all queries to a csv file"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.stacktrace :as stacktrace]
   [clojure.string :as str]
   [dev.util :as dev.u]
   [metabase.test.util.log :as tu.log]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def queries*
  "An atom to store all the queries and its execution time."
  (atom []))

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

(defn call-site
  "Return first callsite inside Metabase that's not `metabase.db`"
  []
  (let [trace (->> (with-out-str
                     (stacktrace/print-stack-trace (Exception. "tracker")))
                   str/split-lines)]
    (some-> (u/seek #(and (re-find #"^\s*metabase\." %)
                      (not (re-find #"^\s*metabase\.db" %))) trace)
            str/trim)))

(defn- track-query-execution-fn
  [next-method rf conn query-type model query]
  (let [start  (System/nanoTime)
        result (next-method rf conn query-type model query)
        end    (System/nanoTime)]
    (swap! queries* (fnil conj []) [query (/ (- end start) 1e6) (call-site)])
   result))

(def ^:private log-thread-ref (volatile! nil))

(defn- create-log-thread! []
  (Thread.
   (fn []
     (while (not (Thread/interrupted))
       (let [{:keys [total-queries total-execution-time-ms]} (summary)]
         (log/infof "Total queries: %d, Total execution time: %dms" total-queries total-execution-time-ms)
         (Thread/sleep 1000))))))

(defn- start-log! []
  (tu.log/set-ns-log-level! *ns* :debug)
  (when-not (some? @log-thread-ref)
    (let [new-thread (create-log-thread!)]
      (vreset! log-thread-ref new-thread)
      (.start ^Thread new-thread))))

(defn- stop-log! []
  (when-let [thread @log-thread-ref]
    (.interrupt ^Thread thread)
    (vreset! log-thread-ref nil)))

(defn start!
  "Start tracking queries."
  []
  (stop-log!)
  (start-log!)
  (methodical/add-aux-method-with-unique-key!
   #'t2.pipeline/transduce-execute-with-connection
   :around
   :default
   track-query-execution-fn
   ::monitor))

(defn stop!
  "Stop tracking queries."
  []
  (stop-log!)
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

(defn do-with-queries
  "Implementation for [[with-queries]]."
  [f]
  (reset-queries!)
  (start!)
  (u/prog1 (f queries)
    (stop!)))

(defmacro with-queries
  "See Toucan queries executed:

  ```clj
  (with-queries [queries]
    (select ...)
    (println :total (count (queries)))) ;; -> :total 1
  ```"
  [[queries-binding] & body]
  `(do-with-queries (^:once fn* [~queries-binding] ~@body)))

(comment
 (start!)
 (queries)
 (stop!)
 (reset-queries!)
 (summary)
 (to-csv!)
 (doseq [q (querles)]
   #_:clj-kondo/ignore
   (println q)))
