(ns metabase.metabot.agent.tools.transforms
  "Transform tool thunks.
  OSS implementations return nil (tools not available).
  EE implementations return full tool definition maps."
  (:require
   [metabase.premium-features.core :as premium-features]))

(set! *warn-on-reflection* true)

(premium-features/defenterprise get-transform-details-tool
  "Returns tool definition for getting transform details, or nil in OSS."
  metabase-enterprise.metabot.agent.tools.transforms
  []
  nil)

(premium-features/defenterprise get-transform-python-library-details-tool
  "Returns tool definition for getting Python library details, or nil in OSS."
  metabase-enterprise.metabot.agent.tools.transforms
  []
  nil)

(premium-features/defenterprise write-transform-sql-tool
  "Returns tool definition for writing SQL transforms, or nil in OSS."
  metabase-enterprise.metabot.agent.tools.transforms
  []
  nil)

(premium-features/defenterprise write-transform-python-tool
  "Returns tool definition for writing Python transforms, or nil in OSS."
  metabase-enterprise.metabot.agent.tools.transforms
  []
  nil)
