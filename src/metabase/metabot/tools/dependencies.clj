(ns metabase.metabot.tools.dependencies
  (:require
   [metabase.premium-features.core :as premium-features]))

(premium-features/defenterprise check-transform-dependencies
  "Check for downstream breakages. Returns nil in OSS."
  metabase-enterprise.metabot.tools.dependencies
  [_transform-map]
  nil)
