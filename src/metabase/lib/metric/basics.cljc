(ns metabase.lib.metric.basics
  (:require
   [metabase.lib.metadata :as lib.metadata]))

(defn source-metric
  "Returns the `:metadata/metric` for the given stage, or nil if this stage is not based on a metric."
  [metadata-providerable stage]
  (some->> stage :source-card (lib.metadata/metric metadata-providerable)))

(defn join-metric
  "Given a metadata provider and a join or joinable, return the `:metadata/metric` the join is targeting.

  `join-or-joinable` can be a join clause, or a `:metadata/card` or `:metadata/metric`."
  [metadata-providerable join-or-joinable]
  (case (:lib/type join-or-joinable)
    :mbql/join
    (when-let [metric (->> join-or-joinable :stages first (source-metric metadata-providerable))]
      (assoc metric :metabase.lib.join/join-alias (:alias join-or-joinable)))

    ;; :metadata/card or :metadata/metric; look it up by ID.
    (:metadata/card :metadata/metric)
    (lib.metadata/metric metadata-providerable (:id join-or-joinable))

    ;; anything else - not found
    nil))
