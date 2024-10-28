(ns metabase-enterprise.metabot-v3.tools.add-to-group
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/add-to-group
  [_tool-name {:keys [user-id group-name], :as _argument-map}]
  {:output (format "Added user with id '%s' to group '%s'." user-id group-name)})
