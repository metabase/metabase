(ns metabase.internal-stats.query-executions
  (:require
   [java-time.api :as t]
   [metabase.internal-stats.util :as u]
   [toucan2.core :as t2]))

(def ^:private query-execution-statistics
  [:model/QueryExecution
   [(u/count-case [:= :embedding_client "embedding-sdk-react"]) :sdk_embed]
   [(u/count-case [:and [:= :embedding_client "embedding-iframe"]
                   [:!= :executor_id nil]])
    :interactive_embed]
   [(u/count-case [:and [:= :embedding_client "embedding-iframe"]
                   [:= :executor_id nil]])
    :static_embed]
   [(u/count-case [:and
                   [:or [:= :embedding_client nil]
                    [:!= :embedding_client "embedding-sdk-react"]]
                   [:or [:= :embedding_client nil]
                    [:!= :embedding_client "embedding-iframe"]]
                   [:like :context "public-%"]])
    :public_link]
   [(u/count-case [:and
                   [:or [:= :embedding_client nil]
                    [:!= :embedding_client "embedding-sdk-react"]]
                   [:or [:= :embedding_client nil]
                    [:!= :embedding_client "embedding-iframe"]]
                   [:not [:like :context "public-%"]]])
    :internal]])

(defn query-executions-all-time-and-last-24h
  "Calculate query executions for the entire available history and over the last 24 hours from now."
  []
  (let [qe          (t2/select-one query-execution-statistics)
        one-day-ago (t/minus (t/offset-date-time) (t/days 1))
        qe-24h      (t2/select-one query-execution-statistics {:where [:> :started_at one-day-ago]})]
    {:query-executions     qe
     :query-executions-24h qe-24h}))

(defn query-execution-last-utc-day
  "Calculate query executions over a window of the the previous UTC day 00:00-23:59"
  []
  (let [yesterday-utc (t/minus (t/offset-date-time (t/zone-offset "+00")) (t/days 1))]
    (-> (t2/select-one query-execution-statistics
                       {:where [:= [:cast :started_at :date] [:cast yesterday-utc :date]]})
        (dissoc :row_count)
        (update-keys #(keyword (str "query_executions_" (name %)))))))
