(ns metabase.explorations.models.exploration-query-result
  (:require
   [clojure.edn :as edn]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ExplorationQueryResult [_model]
  :exploration_query_result)

(doto :model/ExplorationQueryResult
  (derive :metabase/model))

(defn- chart-stats-in
  "Encode `compute-chart-stats` output as EDN. JSON would mangle the shape:
  `:chart-type` is a keyword, `:series` is keyed by series-name *strings*,
  and the histogram `:distribution :estimated-percentiles` is keyed by
  *integers* — only EDN round-trips all three."
  [v]
  (cond
    (nil? v)    nil
    (string? v) v
    :else       (pr-str v)))

(defn- chart-stats-out
  "Decode the EDN blob, recovering `nil` (with a warning) on parse failure
  rather than crashing the whole `t2/select`. Bad rows can come from data
  written under an earlier transform (e.g. JSON), or from forward-compat
  scenarios where the writer used types the reader can't parse — neither
  should ever break a read."
  [s]
  (when (string? s)
    (try
      (edn/read-string {:readers {} :default (fn [tag v] [::unknown-tag tag v])} s)
      (catch Throwable e
        (log/warn e "Failed to parse exploration_query_result.chart_stats; returning nil")
        nil))))

(def ^:private transform-encrypted-text
  {:in  encryption/maybe-encrypt
   :out encryption/maybe-decrypt})

(t2/deftransforms :model/ExplorationQueryResult
  {:chart_stats        {:in chart-stats-in :out chart-stats-out}
   :metric_description transform-encrypted-text
   :chart_description  transform-encrypted-text})

(defn stored-results
  "Resolve the cached stored_result for an exploration_query_id via the EQR FK. Returns the
  full stored_result row (creator/db/blob/query) or nil when no result row exists yet (query
  still pending/errored)."
  [eq-id]
  (when-let [sr-id (t2/select-one-fn :stored_result_id :model/ExplorationQueryResult
                                     :exploration_query_id eq-id)]
    (t2/select-one :model/StoredResult :id sr-id)))
