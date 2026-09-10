(ns metabase.internal-stats.query-executions
  (:require
   [java-time.api :as t]
   [metabase.internal-stats.db :as internal-stats.db]))

(defn query-executions-all-time-and-last-24h
  "Calculate query executions for the entire available history and over the last 24 hours from now."
  []
  (let [qe          (internal-stats.db/query-execution-statistics-all-time)
        one-day-ago (t/minus (t/offset-date-time) (t/days 1))
        qe-24h      (internal-stats.db/query-execution-statistics-since one-day-ago)]
    {:query-executions     qe
     :query-executions-24h qe-24h}))

(defn query-execution-last-utc-day
  "Calculate query executions over a window of the the previous UTC day 00:00-23:59"
  []
  (let [yesterday-utc (t/minus (t/offset-date-time (t/zone-offset "+00")) (t/days 1))]
    (-> (internal-stats.db/query-execution-statistics-on yesterday-utc)
        (dissoc :row_count)
        (update-keys #(keyword (str "query_executions_" (name %)))))))
