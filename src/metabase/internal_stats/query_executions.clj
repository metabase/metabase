(ns metabase.internal-stats.query-executions
  (:require
   [java-time.api :as t]
   [metabase.internal-stats.util :as u]
   [toucan2.core :as t2]))

(def ^:private sdk-embed-condition
  [:= :embedding_client "embedding-sdk-react"])

(def ^:private simple-embed-condition
  [:= :embedding_client "embedding-simple"])

(def ^:private interactive-embed-condition
  [:or
   [:= :embedding_client "embedding-iframe-full-app"]
   ;; legacy for backwards compatibility
   [:and [:= :embedding_client "embedding-iframe"]
    [:!= :executor_id nil]]])

(def ^:private static-embed-condition
  [:or
   [:= :embedding_client "embedding-iframe-static"]
   ;; legacy for backwards compatibility
   [:and [:= :embedding_client "embedding-iframe"]
    [:= :executor_id nil]]])

(def ^:private public-link-condition
  [:or
   [:= :embedding_client "embedding-public"]
   [:like :context "public-%"]])

(def ^:private query-execution-statistics
  [:model/QueryExecution
   [(u/count-case sdk-embed-condition)         :sdk_embed]
   [(u/count-case interactive-embed-condition) :interactive_embed]
   [(u/count-case static-embed-condition)      :static_embed]
   [(u/count-case public-link-condition)       :public_link]
   [(u/count-case simple-embed-condition)      :simple_embed]
   ;; fallthru: if a row does NOT match the above, it will match this condition and be counted internal.
   [(u/count-case [:not [:or sdk-embed-condition
                         interactive-embed-condition
                         simple-embed-condition
                         static-embed-condition
                         public-link-condition]]) :internal]])

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
