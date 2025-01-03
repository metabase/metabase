(ns metabase-enterprise.cache.config
  (:require [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise refreshable-states
  "States of `persisted_info` records which can be refreshed."
  :feature :cache-granular-controls
  []
  ;; meant to be the same as the oss version except that "off" is deleteable rather than refreshable
  #{"refreshing" "creating" "persisted" "error"})

(defenterprise prunable-states
  "States of `persisted_info` records which can be pruned."
  :feature :cache-granular-controls
  []
  #{"deletable" "off"})
