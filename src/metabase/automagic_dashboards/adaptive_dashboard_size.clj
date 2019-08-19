(ns metabase.automagic-dashboards.adaptive-dashboard-size
  (:require [bigml.histogram.core :as hist]
            [clojure.core.memoize :as memo]
            [metabase.models
             [database :refer [Database]]
             [query-execution :refer [QueryExecution]]]
            [metabase.public-settings :as public-settings]
            [metabase.sync.analyze.fingerprint.fingerprinters :refer [histogram]]
            [redux.core :as redux]
            [toucan.db :as db]))

(def ^:private ^Long long-running-90th-percentile-threshold
  "If 10% of queries take longer than this to run, consider the DB to be slow. Unit is ms."
  5000)

(def ^:private ^Long max-cards 15)
(def ^:private ^Long max-cards-if-no-summary 3)

(def ^:private ^{:arglists '([db-id])} running-time-90th-percentile
  (memo/ttl #(transduce identity
                        (redux/post-complete
                         histogram
                         (fn [h]
                           ((hist/percentiles h 0.9) 0.9)))
                        (db/select-field :running_time QueryExecution :database_id %))
            :ttl/threshold (* (public-settings/query-caching-max-ttl) 1000)))

(defn- slow-db?
  [db-id]
  (> (running-time-90th-percentile db-id) long-running-90th-percentile-threshold))

(defn max-cards-for-dashboard
  [{{:keys [database]} :root groups :groups}]
  (let [summary (if (some (partial contains? groups) ["Summary" "Overview"])
                  :summary
                  max-cards-if-no-summary)]
    (cond
      (-> database Database :auto_run_queries false?) summary
      (slow-db? database)                             summary
      :else                                           max-cards)))
