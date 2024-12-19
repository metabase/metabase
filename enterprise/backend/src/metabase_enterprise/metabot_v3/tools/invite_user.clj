(ns metabase-enterprise.metabot-v3.tools.invite-user
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.api.user :as api.user]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/invite-user
  [_tool-name {:keys [email]} _env]
  (let [output (try
                 (api.user/invite-user {:email email})
                 (format "%s has been invited to metabase" email)
                 (catch Exception e
                   {:error (ex-message e)}))]
    {:output output}))
