(ns metabase.automagic-dashboards.adaptive-dashboard-size
  (:require [bigml.histogram.core :as hist]
            [clojure.core.memoize :as memo]
            [metabase.models
             [database :refer [Database]]
             [query-execution :refer [QueryExecution]]]
            [metabase.sync.analyze.fingerprint.fingerprinters :refer [histogram]]
            [redux.core :as redux]
            [toucan.db :as db]))

(def ^:private ^Long long-running-90th-percentile-threshold
  "If 10% of queries take longer than this to run, consider the DB to be slow. Unit is ms."
  5000)

(def ^:private ^Long running-time-cache-ttl (* 60 60 24 7 1000)) ; 1 week in ms

(def ^:private ^Long max-cards 15)
(def ^:private ^Long max-cards-if-no-summary 3)

(def ^:private ^{:arglists '([db-id])} running-time-90th-percentile
  (memo/ttl #(transduce identity
                        (redux/post-complete
                         histogram
                         (fn [h]
                           ((hist/percentiles h 0.9) 0.9)))
                        (db/select-field :running_time QueryExecution :database_id %))
            :ttl/threshold running-time-cache-ttl))

(defn- slow-db?
  [db-id]
  (some-> db-id running-time-90th-percentile (> long-running-90th-percentile-threshold)))

(defn max-cards-for-dashboard
  "What is the maximum number of cards to to show for the given dashboard? Returns either a number,
   or `:summary` (show just the summary section of an x-ray)."
  [{{:keys [database]} :root groups :groups}]
  (let [summary (if (some (partial contains? groups) ["Summary" "Overview"])
                  :summary
                  max-cards-if-no-summary)]
    (cond
      (-> database Database :auto_run_queries false?) summary
      (slow-db? database)                             summary
      :else                                           max-cards)))
