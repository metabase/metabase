(ns metabase-enterprise.metabot-v3.tools.confirm-invite-user
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/confirm-invite-user
  [_tool-name _context]
  #_api/*is-superuser?*
  ;; for now, never send in this tool - we can uncomment this to enable it when we want it to be allowed.
  false)

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/confirm-invite-user
  [_tool-name {:keys [email], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/confirmed-api-call
                :description (format "Invite a user with email '%s' to Metabase" email)
                :api-call {:method "POST"
                           :endpoint "/api/user"
                           :body {:email email}}}]
   :output "Confirmation required - awaiting user input."})
