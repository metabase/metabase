(ns metabase.metrics.permissions
  "Metric permission helpers."
  (:require
   [metabase.permissions.metric :as permissions.metric]))

(defn filter-dimensions-for-user
  "Remove metric dimensions and mappings unavailable to the current user."
  [metric]
  (permissions.metric/filter-dimensions-for-user metric))
