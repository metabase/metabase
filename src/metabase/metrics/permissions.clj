(ns metabase.metrics.permissions
  "Metric permission helpers."
  (:require
   [metabase.permissions.metric :as permissions.metric]))

(defn filter-dimensions-for-user
  "Remove metric dimensions and mappings unavailable to the current user."
  [metric]
  (permissions.metric/filter-dimensions-for-user metric))

(defn filter-dimensions-for-user-batch
  "Batched [[filter-dimensions-for-user]] across many `metrics`.

   Returns the metrics in the same order, each with `:dimensions`/`:dimension_mappings` filtered,
   doing the permission lookups once for the whole seq."
  [metrics]
  (permissions.metric/filter-dimensions-for-user-batch metrics))

(defn sandbox-restricted-fields
  "For sandboxed tables, returns {table-id -> #{allowed-field-ids}}. Tables not in the returned map have no column
  restriction; nil means no sandboxes apply."
  [table-ids]
  (permissions.metric/sandbox-restricted-fields table-ids))
