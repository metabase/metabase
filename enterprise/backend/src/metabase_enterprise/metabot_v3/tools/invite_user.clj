(ns metabase-enterprise.metabot-v3.tools.invite-user
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.api.user :as api.user]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/invite-user
  [_tool-name {:keys [email]} _env]
  (try
    (api.user/invite-user {:email email})
    {:output (format "%s has been invited to Metabase." email)}
    (catch clojure.lang.ExceptionInfo e
      (let [d (ex-data e)]
        (if-let [message (when (= (:status-code d) 400)
                           (-> d :errors :email))]
          {:output message}
          (throw e))))))
