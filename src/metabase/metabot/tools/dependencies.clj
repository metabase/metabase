(ns metabase.metabot.tools.dependencies
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise check-transform-dependencies
  "Check for downstream breakages. Returns nil in OSS."
  metabase-enterprise.metabot.tools.dependencies
  [_transform-map]
  nil)
