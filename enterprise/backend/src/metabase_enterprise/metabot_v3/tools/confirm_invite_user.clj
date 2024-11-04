(ns metabase-enterprise.metabot-v3.tools.confirm-invite-user
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.api.common :as api]
   [metabase.util.malli :as mu]))

(defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/confirm-invite-user
  [_tool-name _context]
  api/*is-superuser?*)

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/confirm-invite-user
  [_tool-name {:keys [email], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/confirmation
                :description (format "Invite a user with email '%s' to Metabase" email)
                :options {:yes [{:type :metabot.reaction/api-call
                                 :api-call {:method "POST"
                                            :url "/api/user"
                                            :body {:email email}}}
                                {:type :metabot.reaction/writeback
                                 :message "The user confirmed the operation and the specified user has been invited to Metabase."}]
                          :no [{:type :metabot.reaction/writeback
                                :message "The user refused the operation. Ask if they need anything else."}]}}]
   :output "Confirmation required - awaiting user input."})
