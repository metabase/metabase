(ns metabase-enterprise.metabot-v3.tools.invite-user
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/invite-user
  [_tool-name _context]
  (log/warn "TODO -- only allow this tool if the current user has invite user permissions")
  true)

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/invite-user
  [_tool-name {:keys [email], :as _argument-map}]
  (log/warnf "TODO -- invite %s" email)
  {:output "{\"id\": 5, \"result\": \"success\"}"})
