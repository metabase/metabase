(ns metabase-enterprise.metabot-v3.tools.get-user-id
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/get-user-id
  [_tool-name {:keys [_email], :as _argument-map}]
  {:output "5"})
