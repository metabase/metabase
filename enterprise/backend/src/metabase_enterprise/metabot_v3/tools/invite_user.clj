(ns metabase-enterprise.metabot-v3.tools.invite-user
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.api.user :as api.user]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/invite-user
  [_tool-name {:keys [email]} context]
  (let [output (try
                 (let [{:keys [id first_name last_name email]} (api.user/invite-user {:email email})]
                   {:id id
                    :name (cond
                            (and (nil? first_name) (nil? last_name)) email

                            (or (nil? first_name) (nil? last_name))
                            (str first_name last_name)

                            :else
                            (str first_name " " last_name))
                    :email_address email})
                 (catch Exception e
                   {:error (ex-message e)}))]
    {:output output
     :context context}))
